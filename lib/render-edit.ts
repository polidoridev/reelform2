import { blobTarget } from "./prepare-video";
import { clipOffsets, editDuration, type Edit } from "./video-edit";

export class RenderCanceled extends Error {
  constructor() {
    super("Rendering was canceled.");
  }
}

// Renders an edit list to an H.264/HEVC MP4 entirely in the browser. Frames are
// re-encoded so cuts can land on any frame, not only on keyframes.
export async function renderEdit(file: File, edit: Edit, progress: (value: number) => void, signal?: AbortSignal): Promise<File> {
  const {
    Input, BlobSource, ALL_FORMATS, Output, Mp4OutputFormat, StreamTarget,
    VideoSampleSink, AudioSampleSink, VideoSampleSource, AudioSampleSource, AudioSample,
    QUALITY_HIGH, getFirstEncodableVideoCodec, canEncodeAudio,
  } = await import("mediabunny");
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  let output: InstanceType<typeof Output> | undefined;
  const check = () => { if (signal?.aborted) throw new RenderCanceled(); };
  try {
    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack || !(await videoTrack.canDecode()))
      throw new Error("Your browser can’t read this video for editing. Try the latest Chrome or Safari, or export it as H.264 MP4.");
    const codec = await getFirstEncodableVideoCodec(["avc", "hevc"], { width: videoTrack.codedWidth, height: videoTrack.codedHeight });
    if (!codec) throw new Error("Your browser can’t create an MP4 at this size. Try the latest Chrome or Safari.");
    let audioTrack = edit.muted ? null : await input.getPrimaryAudioTrack();
    if (audioTrack && !(await audioTrack.canDecode())) audioTrack = null;
    if (audioTrack && !(await canEncodeAudio("aac", { numberOfChannels: audioTrack.numberOfChannels, sampleRate: audioTrack.sampleRate })))
      throw new Error("Your browser can’t save this video’s sound. Mute the audio in the editor, or try the latest Chrome or Safari.");

    const sink = blobTarget(StreamTarget);
    output = new Output({ format: new Mp4OutputFormat({ fastStart: false }), target: sink.target });
    const videoSource = new VideoSampleSource({ codec, quality: QUALITY_HIGH });
    output.addVideoTrack(videoSource, { rotation: await videoTrack.getRotation(), flip: await videoTrack.getFlip() });
    const audioSource = audioTrack ? new AudioSampleSource({ codec: "aac", quality: QUALITY_HIGH }) : null;
    if (audioSource) output.addAudioTrack(audioSource);
    await output.start();

    const total = editDuration(edit);
    const offsets = clipOffsets(edit);
    const writeVideo = async () => {
      const frames = new VideoSampleSink(videoTrack);
      let last = -1;
      for (const [index, clip] of edit.clips.entries()) {
        for await (const sample of frames.samples(clip.start, clip.end)) {
          try {
            check();
            // The first frame may begin before the cut; it is shown from the cut onward.
            const start = offsets[index] + Math.max(0, sample.timestamp - clip.start);
            const end = offsets[index] + Math.min(sample.timestamp + sample.duration, clip.end) - clip.start;
            if (end - start <= 0.0005 || start <= last) continue;
            sample.setTimestamp(start);
            sample.setDuration(end - start);
            await videoSource.add(sample);
            last = start;
            progress(Math.min(end / total, 1));
          } finally {
            sample.close();
          }
        }
      }
      videoSource.close();
    };
    const writeAudio = async () => {
      if (!audioTrack || !audioSource) return;
      const samples = new AudioSampleSink(audioTrack);
      const channels = audioTrack.numberOfChannels;
      const rate = audioTrack.sampleRate;
      let cursor = 0;
      const add = async (data: Float32Array, frames: number) => {
        const sample = new AudioSample({ data, format: "f32-planar", numberOfChannels: channels, sampleRate: rate, timestamp: cursor });
        try { await audioSource.add(sample); } finally { sample.close(); }
        cursor += frames / rate;
      };
      for (const [index, clip] of edit.clips.entries()) {
        // Keep audio aligned with the picture when a clip has no sound at its start.
        const gap = Math.round((offsets[index] - cursor) * rate);
        if (gap > rate * 0.02) await add(new Float32Array(gap * channels), gap);
        for await (const sample of samples.samples(clip.start, clip.end)) {
          try {
            check();
            const from = Math.max(sample.timestamp, clip.start);
            const to = Math.min(sample.timestamp + sample.duration, clip.end);
            const frameOffset = Math.max(0, Math.round((from - sample.timestamp) * rate));
            const frameCount = Math.min(Math.round((to - from) * rate), sample.numberOfFrames - frameOffset);
            if (frameCount <= 0) continue;
            const data = new Float32Array(frameCount * channels);
            for (let plane = 0; plane < channels; plane++)
              sample.copyTo(data.subarray(plane * frameCount, (plane + 1) * frameCount), { planeIndex: plane, format: "f32-planar", frameOffset, frameCount });
            await add(data, frameCount);
          } finally {
            sample.close();
          }
        }
      }
      audioSource.close();
    };
    await Promise.all([writeVideo(), writeAudio()]);
    check();
    await output.finalize();
    progress(1);
    const name = file.name.replace(/\.[^.]+$/, "") || "video";
    return new File([sink.blob()], `${name.replace(/-edit$/, "")}-edit.mp4`, { type: "video/mp4" });
  } catch (error) {
    await output?.cancel().catch(() => {});
    if (error instanceof RenderCanceled || signal?.aborted) throw new RenderCanceled();
    throw error instanceof Error ? error : new Error("This edit couldn’t be rendered. Please try again.");
  } finally {
    input.dispose();
  }
}

// Small evenly spaced frames for the timeline. Failures leave the timeline without pictures.
export async function sourceThumbnails(file: File, times: number[], height: number, signal?: AbortSignal) {
  const { Input, BlobSource, ALL_FORMATS, CanvasSink } = await import("mediabunny");
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  const images: (string | null)[] = [];
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track || !(await track.canDecode())) return [];
    const sink = new CanvasSink(track, { height, poolSize: 1 });
    for await (const frame of sink.canvasesAtTimestamps(times)) {
      if (signal?.aborted) break;
      if (!frame) { images.push(null); continue; }
      const canvas = frame.canvas;
      images.push(
        "convertToBlob" in canvas
          ? URL.createObjectURL(await canvas.convertToBlob({ type: "image/jpeg", quality: 0.7 }))
          : canvas.toDataURL("image/jpeg", 0.7),
      );
    }
    return images;
  } catch {
    return images;
  } finally {
    input.dispose();
  }
}
