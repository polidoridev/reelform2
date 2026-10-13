import { AURA_FPS, AURA_STYLES, AURA_TRACKS, auraDimensions, auraSourceProgress, planAura, type AuraSettings, type AuraSource } from "./aura-edit";
import { blobTarget } from "./prepare-video";
import { compileAuraAiPlan, type AuraAiPlan } from "./aura-ai";

export type AuraFile = AuraSource & { file: File };

export async function inspectAuraClip(file: File) {
  const { Input, BlobSource, ALL_FORMATS } = await import("mediabunny");
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track || !(await track.canDecode())) throw new Error(`“${file.name}” cannot be decoded here. Try an H.264 MP4 in Chrome or Safari.`);
    const duration = await track.computeDuration();
    if (!Number.isFinite(duration) || duration < 0.5 || duration > 120) throw new Error(`“${file.name}” must be between 0.5 and 120 seconds.`);
    return duration;
  } finally { input.dispose(); }
}

export async function decodeAuraMusic(file: File) {
  if (file.size > 25 * 1024 * 1024) throw new Error("Choose a music file up to 25 MB.");
  const context = new AudioContext();
  try {
    const buffer = await context.decodeAudioData(await file.arrayBuffer());
    if (buffer.duration < 4 || buffer.duration > 180) throw new Error("Choose a soundtrack between 4 seconds and 3 minutes.");
    return buffer;
  } finally { await context.close(); }
}

// Original synthesized loops; no remote recordings or third-party music assets.
export function auraSoundtrack(settings: AuraSettings, uploaded?: AudioBuffer, seconds = settings.seconds) {
  if (!Number.isFinite(settings.musicOffset) || settings.musicOffset < 0) throw new Error("Choose a valid music start time.");
  if (settings.music === "upload" && (!uploaded || settings.musicOffset + seconds > uploaded.duration + 0.01))
    throw new Error("The music is too short from this start point. Choose an earlier start, a shorter edit, or another track.");
  const rate = uploaded && settings.music === "upload" ? uploaded.sampleRate : 44100;
  const channels = uploaded && settings.music === "upload" ? Math.min(2, uploaded.numberOfChannels) : 2;
  const result = new AudioBuffer({ length: Math.ceil(seconds * rate), numberOfChannels: channels, sampleRate: rate });
  const track = AURA_TRACKS.find(item => item.id === settings.music);
  const beat = 60 / (track?.bpm ?? settings.bpm);
  const melody = [0, 0, 7, 3, 0, 10, 7, 3];
  for (let channel = 0; channel < channels; channel++) {
    const data = result.getChannelData(channel);
    const source = settings.music === "upload" ? uploaded!.getChannelData(channel) : null;
    for (let i = 0; i < data.length; i++) {
      const t = i / rate;
      let value: number;
      if (source) value = source[i + Math.round(settings.musicOffset * rate)] ?? 0;
      else {
        const step = Math.floor(t / beat);
        const local = t % beat;
        const kick = Math.sin(2 * Math.PI * (48 * local + 65 * 0.025 * (1 - Math.exp(-local / 0.025)))) * Math.exp(-local * 22);
        const noise = (Math.sin(i * 12.9898 + channel * 78.233) * 43758.5453 % 1);
        const hat = noise * Math.exp(-(t % (beat / 2)) * 95) * 0.12;
        const snare = step % 2 ? noise * Math.exp(-local * 30) * 0.22 : 0;
        const freq = 55 * 2 ** (melody[Math.floor(step / 2) % melody.length] / 12);
        const bass = Math.tanh(Math.sin(2 * Math.PI * freq * local) * (settings.music === "redline" ? 3 : 1.4)) * Math.exp(-local * 4) * 0.25;
        const lead = Math.sin(2 * Math.PI * freq * 4 * local) * Math.exp(-local * 12) * (settings.music === "after-hours" ? 0.09 : 0.16);
        value = (kick * 0.5 + bass + hat + snare + lead) * 0.8;
      }
      const fade = Math.min(1, t / 0.02, (seconds - t) / 0.35);
      data[i] = Math.max(-1, Math.min(1, value * fade));
    }
  }
  return result;
}

export async function renderAura(files: AuraFile[], settings: AuraSettings, uploadedMusic: AudioBuffer | undefined, progress: (value: number) => void, signal: AbortSignal, aiPlan?: AuraAiPlan): Promise<File> {
  const shots = aiPlan ? compileAuraAiPlan(aiPlan, files, settings) : planAura(files, settings);
  const soundtrack = auraSoundtrack(settings, uploadedMusic);
  const { Input, BlobSource, ALL_FORMATS, CanvasSink, CanvasSource, AudioBufferSource, Output, Mp4OutputFormat, StreamTarget, canEncodeAudio, canEncodeVideo } = await import("mediabunny");
  const { width, height } = auraDimensions(settings.shape);
  if (!(await canEncodeVideo("avc", { width, height })) || !(await canEncodeAudio("aac", { numberOfChannels: soundtrack.numberOfChannels, sampleRate: soundtrack.sampleRate })))
    throw new Error("MP4 export is not supported in this browser. Open Aura edits in the latest Chrome or Safari.");
  const check = () => { if (signal.aborted) throw new DOMException("Export canceled.", "AbortError"); };
  const inputs = files.map(item => new Input({ source: new BlobSource(item.file), formats: ALL_FORMATS }));
  let output: InstanceType<typeof Output> | undefined;
  try {
    const sinks = await Promise.all(inputs.map(async input => {
      const track = await input.getPrimaryVideoTrack();
      if (!track || !(await track.canDecode())) throw new Error("One of your clips can no longer be decoded. Try an H.264 MP4.");
      return new CanvasSink(track, { width, height, fit: settings.fit, poolSize: 2 });
    }));
    check();
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("This browser cannot create the video canvas.");
    const target = blobTarget(StreamTarget);
    output = new Output({ format: new Mp4OutputFormat({ fastStart: false }), target: target.target });
    const video = new CanvasSource(canvas, { codec: "avc", bitrate: 5_000_000 });
    const audio = new AudioBufferSource({ codec: "aac", bitrate: 192_000 });
    output.addVideoTrack(video, { frameRate: AURA_FPS });
    output.addAudioTrack(audio);
    await output.start();
    const writeVideo = async () => {
      for (const shot of shots) {
        const style = AURA_STYLES.find(item => item.id === (shot.style ?? settings.style))!;
        const timestamps = Array.from({ length: shot.frames }, (_, i) => shot.sourceStart + auraSourceProgress(style.id, i / shot.frames) * shot.sourceSpan);
        let local = 0;
        for await (const frame of sinks[shot.source].canvasesAtTimestamps(timestamps)) {
          check();
          if (!frame) throw new Error("A frame in your clip could not be read. Choose a later start point or a different clip.");
          const p = local / shot.frames;
          const punch = style.id === "velocity" ? 0.07 * Math.exp(-p * 10) : 0;
          const zoom = settings.fit === "contain" ? 1 : 1 + punch + p * (style.id === "midnight" ? 0.06 : 0.025);
          ctx.save();
          ctx.fillStyle = "#080b12"; ctx.fillRect(0, 0, width, height);
          ctx.filter = style.filter;
          ctx.translate(width / 2, height / 2);
          ctx.scale(zoom, zoom);
          ctx.drawImage(frame.canvas, -width / 2, -height / 2, width, height);
          ctx.restore();
          // Gentle edge shading, avoiding strobe/flash transitions.
          if (style.id !== "clean") {
            const shade = ctx.createRadialGradient(width / 2, height / 2, width * 0.2, width / 2, height / 2, Math.max(width, height) * 0.72);
            shade.addColorStop(0, "transparent"); shade.addColorStop(1, "rgba(0,0,0,0.35)");
            ctx.fillStyle = shade; ctx.fillRect(0, 0, width, height);
          }
          await video.add((shot.startFrame + local) / AURA_FPS, 1 / AURA_FPS);
          local++;
          progress((shot.startFrame + local) / Math.round(settings.seconds * AURA_FPS) * 0.95);
          if (local % 15 === 0) await new Promise(resolve => setTimeout(resolve, 0));
        }
      }
      video.close();
    };
    // Both tracks must advance concurrently so the MP4 muxer can apply backpressure.
    const writeAudio = async () => { check(); await audio.add(soundtrack); audio.close(); };
    await Promise.all([writeVideo(), writeAudio()]);
    check();
    await output.finalize();
    progress(1);
    return new File([target.blob()], `reelform-aura-${settings.style}.mp4`, { type: "video/mp4" });
  } catch (error) {
    await output?.cancel().catch(() => {});
    throw error;
  } finally { inputs.forEach(input => input.dispose()); }
}

// Only these small JPEGs are sent for AI planning. Source videos and audio stay local.
export async function sampleAuraClips(files: AuraFile[], signal: AbortSignal) {
  const { Input, BlobSource, ALL_FORMATS, CanvasSink } = await import("mediabunny");
  const samples = [];
  for (const file of files) {
    const input = new Input({ source: new BlobSource(file.file), formats: ALL_FORMATS });
    try {
      const track = await input.getPrimaryVideoTrack();
      if (!track) throw new Error("A clip could not be opened for AI planning.");
      const sink = new CanvasSink(track, { width: 320, height: 320, fit: "contain", poolSize: 1 });
      const times = [0.1, 0.5, 0.9].map(fraction => file.start + (file.duration - file.start - 0.05) * fraction);
      const frames = [];
      for (const time of times) {
        signal.throwIfAborted();
        const frame = await sink.getCanvas(time);
        if (!frame) throw new Error("A clip frame could not be read. Try moving its start point.");
        const canvas = document.createElement("canvas"); canvas.width = 320; canvas.height = 320;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Frame previews are unavailable in this browser.");
        ctx.drawImage(frame.canvas, 0, 0);
        const image = canvas.toDataURL("image/jpeg", 0.6);
        if (image.length > 65000) throw new Error("A frame preview was too large. Try another clip.");
        frames.push({ time, image });
      }
      samples.push({ duration: file.duration, start: file.start, frames });
    } finally { input.dispose(); }
  }
  return samples;
}
