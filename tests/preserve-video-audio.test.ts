import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  Input, BlobSource, ALL_FORMATS, Output, Mp4OutputFormat, MovOutputFormat, BufferTarget,
  EncodedPacket, EncodedPacketSink, EncodedVideoPacketSource, EncodedAudioPacketSource,
} from "mediabunny";
import { preserveVideoAudio } from "../lib/preserve-video-audio";
import { prepareVideo } from "../lib/prepare-video";
const max = 50 * 1024 * 1024;
const open = (blob: Blob) => new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
async function fixture(mov = false) {
  const picture = new Blob([new Uint8Array(await readFile("public/media/arrival.mp4"))]);
  const input = open(picture);
  try {
    const track = (await input.getPrimaryVideoTrack())!;
    const target = new BufferTarget();
    const output = new Output({ format: mov ? new MovOutputFormat() : new Mp4OutputFormat(), target });
    const video = new EncodedVideoPacketSource(track.codec!);
    const audio = new EncodedAudioPacketSource("aac");
    output.addVideoTrack(video, { decoderConfig: (await track.getDecoderConfig())! });
    output.addAudioTrack(audio, { decoderConfig: { codec: "mp4a.40.2", sampleRate: 44100, numberOfChannels: 2, description: new Uint8Array([0x12, 0x10]) } });
    await output.start();
    for await (const packet of new EncodedPacketSink(track).packets()) await video.add(packet);
    video.close();
    // AAC silence frames, extended past the picture to exercise audio trimming.
    for (let n = 0; n < 500; n++) await audio.add(new EncodedPacket(new Uint8Array([0x21,0x10,0x04,0x60,0x8c,0x1c]), "key", n * 1024 / 44100, 1024 / 44100));
    audio.close();
    await output.finalize();
    return { picture, original: new Blob([target.buffer!]) };
  } finally { input.dispose(); }
}
test("saved output preserves original audio packets and generated video, trimming sound at the final frame", async () => {
  const { picture, original } = await fixture();
  const merged = open(await preserveVideoAudio(picture, new BlobSource(original), max));
  const source = open(original);
  const generated = open(picture);
  try {
    const audio = (await merged.getPrimaryAudioTrack())!;
    assert.equal(audio.codec, "aac");
    const originalPacket = await new EncodedPacketSink((await source.getPrimaryAudioTrack())!).getFirstPacket();
    const savedPacket = await new EncodedPacketSink(audio).getFirstPacket();
    assert.deepEqual(savedPacket!.data, originalPacket!.data);
    const v = (await merged.getPrimaryVideoTrack())!;
    assert.ok(await audio.computeDuration() <= await v.computeDuration() + 0.03);
    assert.deepEqual((await new EncodedPacketSink(v).getFirstPacket())!.data, (await new EncodedPacketSink((await generated.getPrimaryVideoTrack())!).getFirstPacket())!.data);
  } finally { merged.dispose(); source.dispose(); generated.dispose(); }
});
test("MOV preparation retains the original AAC track", async () => {
  const { original } = await fixture(true);
  const prepared = await prepareVideo(new File([original], "camera.mov", { type: "video/quicktime" }), () => {});
  const input = open(prepared);
  try { assert.equal((await input.getPrimaryAudioTrack())?.codec, "aac"); } finally { input.dispose(); }
});
test("silent source stays silent and output size remains bounded", async () => {
  const { picture, original } = await fixture();
  const input = open(await preserveVideoAudio(original, new BlobSource(picture), max));
  try { assert.equal(await input.getPrimaryAudioTrack(), null); } finally { input.dispose(); }
  await assert.rejects(preserveVideoAudio(picture, new BlobSource(original), 100), /storage limit/);
});
