import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Input, BlobSource, ALL_FORMATS, Output, MovOutputFormat, BufferTarget, Conversion } from "mediabunny";
import { prepareVideo } from "../lib/prepare-video";
import { inspectVideo } from "../lib/commerce/media";

test("real MOV footage is remuxed to an MP4 with duration and dimensions preserved", async () => {
  const source = new Blob([new Uint8Array(await readFile("public/media/arrival.mp4"))]);
  const original = new Input({ source: new BlobSource(source), formats: ALL_FORMATS });
  const target = new BufferTarget();
  const output = new Output({ format: new MovOutputFormat(), target });
  const conversion = await Conversion.init({ input: original, output });
  await conversion.execute();
  const expected = await original.computeDuration();
  const track = (await original.getPrimaryVideoTrack())!;
  const mov = new File([target.buffer!], "fixture.MOV", { type: "video/quicktime" });
  const prepared = await prepareVideo(mov, () => {});
  assert.equal(prepared.type, "video/mp4");
  assert.equal(prepared.name, "fixture.mp4");
  const input = new Input({ source: new BlobSource(prepared), formats: ALL_FORMATS });
  assert.ok(Math.abs(await input.computeDuration() - expected) < 0.1);
  const preparedTrack = (await input.getPrimaryVideoTrack())!;
  assert.equal(preparedTrack.codec, track.codec);
  assert.equal(preparedTrack.codedWidth, track.codedWidth);
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    const [,a,b] = new Headers(init?.headers).get("Range")!.match(/bytes=(\d+)-(\d+)/)!;
    return new Response(prepared.slice(+a,+b+1),{status:206,headers:{"content-range":`bytes ${a}-${b}/${prepared.size}`}});
  };
  try { const info=await inspectVideo("https://uploads.example/fixture.mp4",prepared.size); assert.ok(Math.abs(info.duration-expected)<0.1); }
  finally {globalThis.fetch=fetchOriginal;input.dispose();original.dispose();}
});
test("ordinary MP4 uploads bypass conversion", async () => {
  const file = new File(["fixture"],"clip.mp4",{type:"video/mp4"});
  assert.equal(await prepareVideo(file,()=>{}),file);
});
