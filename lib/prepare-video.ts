import { MAX_VIDEO_BYTES, MIN_VIDEO_SECONDS, MAX_VIDEO_SECONDS } from "./video-limits";

// Repackage compatible MOV/M4V tracks without re-encoding; transcode other
// codecs only when necessary. Blob slices avoid buffering a 1 GB ArrayBuffer.
export async function prepareVideo(file: File, progress: (value: number) => void): Promise<File> {
  if (/\.mp4$/i.test(file.name) && file.type === "video/mp4") return file;
  const { Input, BlobSource, ALL_FORMATS, Output, Mp4OutputFormat, StreamTarget, Conversion } = await import("mediabunny");
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  let conversion: Awaited<ReturnType<typeof Conversion.init>> | undefined;
  try {
    const video = await input.getPrimaryVideoTrack();
    if (!video) throw new Error("This file does not contain a readable video track.");
    const duration = await input.computeDuration();
    if (!Number.isFinite(duration) || duration < MIN_VIDEO_SECONDS || duration > MAX_VIDEO_SECONDS)
      throw new Error("Please use a video between 4 and 30 seconds long.");
    let blob = new Blob([], { type: "video/mp4" });
    const target = new StreamTarget(new WritableStream({
      write({ data, position }) {
        const end = position + data.byteLength;
        if (end > MAX_VIDEO_BYTES) throw new Error("The prepared video exceeds the 1 GB upload limit.");
        const gap = Math.max(0, position - blob.size);
        blob = new Blob([blob.slice(0, position), ...(gap ? [new Uint8Array(gap)] : []), data, blob.slice(end)], { type: "video/mp4" });
      },
    }), { chunked: true, chunkSize: 1024 * 1024 });
    const output = new Output({ format: new Mp4OutputFormat({ fastStart: false }), target });
    conversion = await Conversion.init({
      input, output, tracks: "primary",
      video: { codec: video.codec === "hevc" ? "hevc" : "avc" },
      // The model generates its own audio; camera spatial audio (apac) is unnecessary.
      audio: { discard: true },
      showWarnings: false,
    });
    if (!conversion.isValid || conversion.discardedTracks.some(({ track }) => track.type === "video"))
      throw new Error("Your browser cannot convert this video's codec. Export it as H.264 MP4, or try the latest Chrome or Safari.");
    conversion.onProgress = progress;
    await conversion.execute();
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".mp4", { type: "video/mp4" });
  } catch (error) {
    await conversion?.cancel().catch(() => {});
    throw error instanceof Error ? error : new Error("This video could not be prepared. Export it as H.264 MP4 and try again.");
  } finally {
    input.dispose();
  }
}
