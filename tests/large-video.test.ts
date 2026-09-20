import test from "node:test";
import assert from "node:assert/strict";
import { inspectMp4 } from "../lib/commerce/media";
import { quoteVideo } from "../lib/commerce/pricing";
import { MAX_VIDEO_BYTES } from "../lib/video-limits";

function box(type: string, ...payloads: Buffer[]) {
  const payload = Buffer.concat(payloads), header = Buffer.alloc(8);
  header.writeUInt32BE(8 + payload.length); header.write(type, 4);
  return Buffer.concat([header, payload]);
}
function metadata() {
  const timing = Buffer.alloc(20); timing.writeUInt32BE(1000, 12); timing.writeUInt32BE(30000, 16);
  const dimensions = Buffer.alloc(84); dimensions.writeUInt32BE(3840 * 65536, 76); dimensions.writeUInt32BE(2160 * 65536, 80);
  const handler = Buffer.alloc(12); handler.write("vide", 8);
  return box("moov", box("mvhd", timing), box("trak", box("tkhd", dimensions), box("mdia", box("mdhd", timing), box("hdlr", handler))));
}

test("1 GB 4K MP4 metadata is read with bounded ranges, including extended-size media boxes", async () => {
  const original = globalThis.fetch;
  try {
    for (const extended of [false, true]) {
      const ftyp = box("ftyp", Buffer.from("isom0000")), moov = metadata();
      const mdat = Buffer.alloc(extended ? 16 : 8), mdatSize = MAX_VIDEO_BYTES - ftyp.length - moov.length;
      mdat.writeUInt32BE(extended ? 1 : mdatSize); mdat.write("mdat", 4);
      if (extended) mdat.writeBigUInt64BE(BigInt(mdatSize), 8);
      const segments = [{at:0,data:ftyp},{at:ftyp.length,data:mdat},{at:MAX_VIDEO_BYTES-moov.length,data:moov}];
      let bytesRead = 0, calls = 0;
      globalThis.fetch = async (_url, init) => {
        const match = new Headers(init?.headers).get("Range")!.match(/^bytes=(\d+)-(\d+)$/)!;
        const start = +match[1], end = +match[2];
        assert.ok(end-start < 1024, "Never buffer the large media payload");
        const data = Buffer.alloc(end-start+1); bytesRead += data.length; calls++;
        for(const segment of segments) {
          const from=Math.max(start,segment.at), to=Math.min(end+1,segment.at+segment.data.length);
          if(from<to)segment.data.copy(data,from-start,from-segment.at,to-segment.at);
        }
        return new Response(data,{status:206,headers:{"content-range":`bytes ${start}-${end}/${MAX_VIDEO_BYTES}`}});
      };
      const result = await inspectMp4("https://uploads.example/large.mp4", MAX_VIDEO_BYTES);
      assert.deepEqual(result,{duration:30,width:3840,height:2160,bytes:MAX_VIDEO_BYTES});
      assert.equal(calls,5); assert.ok(bytesRead < 1024);
      assert.equal(quoteVideo(result,"720p").credits,quoteVideo({...result,width:1280,height:720},"720p").credits);
    }
  } finally { globalThis.fetch=original; }
});

test("oversized uploads are rejected before any download", async () => {
  const original=globalThis.fetch;let requested=false;
  globalThis.fetch=async()=>{requested=true;throw Error("Unexpected fetch");};
  try { await assert.rejects(inspectMp4("https://uploads.example/large.mp4",MAX_VIDEO_BYTES+1),/Invalid upload size/);assert.equal(requested,false); }
  finally {globalThis.fetch=original;}
});
