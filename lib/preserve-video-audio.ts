import {
  Input, BlobSource, ALL_FORMATS, Output, Mp4OutputFormat, StreamTarget,
  EncodedPacketSink, EncodedVideoPacketSource, EncodedAudioPacketSource,
  type Source,
} from "mediabunny";

// Copy encoded packets, preserving picture quality and the source soundtrack.
// Trim audio at the final frame; never stretch or loop a shorter soundtrack.
export async function preserveVideoAudio(video: Blob, original: Source, maxBytes: number): Promise<Blob> {
  const picture = new Input({ source: new BlobSource(video), formats: ALL_FORMATS });
  const source = new Input({ source: original, formats: ALL_FORMATS });
  let output: Output | undefined;
  try {
    const audio = await source.getPrimaryAudioTrack();
    const track = await picture.getPrimaryVideoTrack();
    if (!track?.codec) throw new Error("The generated video is unreadable.");
    if (audio && !audio.codec) throw new Error("The original audio codec is unreadable.");
    let result = new Blob([], { type: "video/mp4" });
    output = new Output({ format: new Mp4OutputFormat({ fastStart: false }), target: new StreamTarget(new WritableStream({
      write({ data, position }) {
        const end = position + data.byteLength;
        if (end > maxBytes) throw new Error("Video with original audio exceeds the storage limit.");
        result = new Blob([result.slice(0, position), ...(position > result.size ? [new Uint8Array(position - result.size)] : []), data, result.slice(end)], { type: "video/mp4" });
      },
    }), { chunked: true, chunkSize: 1024 * 1024 }) });
    const videoSource = new EncodedVideoPacketSource(track.codec);
    output.addVideoTrack(videoSource, { decoderConfig: (await track.getDecoderConfig())!, rotation: await track.getRotation() });
    const audioSource = audio?.codec ? new EncodedAudioPacketSource(audio.codec) : undefined;
    if (audioSource && audio) output.addAudioTrack(audioSource, { decoderConfig: (await audio.getDecoderConfig())! });
    await output.start();
    const end = await track.computeDuration();
    await Promise.all([
      (async () => {
        for await (const packet of new EncodedPacketSink(track).packets()) await videoSource.add(packet);
        videoSource.close();
      })(),
      (async () => {
        if (!audioSource || !audio) return;
        for await (const packet of new EncodedPacketSink(audio).packets()) {
          if (packet.timestamp >= end) break;
          await audioSource.add(packet.clone({ duration: Math.min(packet.duration, end - packet.timestamp) }));
        }
        audioSource.close();
      })(),
    ]);
    await output.finalize();
    return result;
  } catch (error) {
    await output?.cancel().catch(() => {});
    throw error;
  } finally {
    picture.dispose();
    source.dispose();
  }
}
