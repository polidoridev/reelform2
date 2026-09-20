import test from "node:test";
import assert from "node:assert/strict";
import { inspectVideo } from "../lib/commerce/media";
import { videoContentType } from "../lib/video-limits";
function ebml(id: string, body: Buffer) {
  assert.ok(body.length < 127);
  return Buffer.concat([Buffer.from(id, "hex"), Buffer.from([128 | body.length]), body]);
}
function webm(seconds = 30, video = true) {
  const duration = Buffer.alloc(8); duration.writeDoubleBE(seconds * 1000);
  const info = ebml("1549a966", ebml("4489", duration));
  const track = ebml("ae", Buffer.concat([ebml("83", Buffer.from([video ? 1 : 2])), ebml("e0", Buffer.concat([ebml("b0", Buffer.from([15,0])), ebml("ba", Buffer.from([8,112]))]))]));
  return Buffer.concat([ebml("1a45dfa3", ebml("4282", Buffer.from("webm"))), ebml("18538067", Buffer.concat([info, ebml("1654ae6b", track)]))]);
}
async function inspect(data: Buffer) {
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    const [, a, b] = new Headers(init?.headers).get("Range")!.match(/bytes=(\d+)-(\d+)/)!;
    return new Response(new Uint8Array(data.subarray(+a, +b + 1)), { status: 206, headers: { "content-range": `bytes ${a}-${b}/${data.length}` } });
  };
  try { return await inspectVideo("https://uploads.example/file", data.length); }
  finally { globalThis.fetch = original; }
}
test("normalizes uppercase and missing MIME types, including QuickTime and M4V", () => {
  assert.equal(videoContentType({name:"iPhone.MOV",type:""}),"video/quicktime");
  assert.equal(videoContentType({name:"clip.m4v",type:"video/x-m4v"}),"video/mp4");
  assert.equal(videoContentType({name:"clip.webm",type:""}),"video/webm");
  assert.equal(videoContentType({name:"clip.avi",type:"video/x-msvideo"}),null);
});
test("WebM metadata verifies 4K dimensions and duration from actual bytes", async () => {
  const data=webm(); assert.deepEqual(await inspect(data),{width:3840,height:2160,duration:30,bytes:data.length});
});
test("rejects long WebM, audio-only files, and disguised invalid containers", async () => {
  await assert.rejects(inspect(webm(31)),/unsupported metadata/);
  await assert.rejects(inspect(webm(30,false)),/unsupported metadata/);
  await assert.rejects(inspect(Buffer.alloc(50)),/Invalid video/);
});
test("MOV/QuickTime atoms work without an MP4 ftyp brand", async () => {
  function box(type: string,...parts: Buffer[]) { const body=Buffer.concat(parts), h=Buffer.alloc(8);h.writeUInt32BE(body.length+8);h.write(type,4);return Buffer.concat([h,body]); }
  const timing=Buffer.alloc(20);timing.writeUInt32BE(1000,12);timing.writeUInt32BE(10000,16);
  const dimensions=Buffer.alloc(84);dimensions.writeUInt32BE(1920*65536,76);dimensions.writeUInt32BE(1080*65536,80);
  const handler=Buffer.alloc(12);handler.write("vide",8);
  const data=box("moov",box("mvhd",timing),box("trak",box("tkhd",dimensions),box("mdia",box("mdhd",timing),box("hdlr",handler))));
  assert.deepEqual(await inspect(data),{duration:10,width:1920,height:1080,bytes:data.length});
});
