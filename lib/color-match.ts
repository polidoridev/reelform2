import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Some models regrade the whole scene (darker, duller, shifted hue) while redrawing it.
// For models that keep the original scene, the result is matched back to the source
// clip's overall brightness, contrast, saturation and hue with one grade for the whole video.

export type ColorCorrection = {
  /** Luma (0–255): corrected = gain × luma + offset. */
  gain: number;
  offset: number;
  /** Chroma scale; 1 keeps saturation. */
  saturation: number;
  /** Hue rotation in degrees. */
  hue: number;
};

const SAMPLE_SIZE = "160:90";
// Limits keep a scene the model changed on purpose from being pushed to extremes.
const GAIN = [0.85, 1.35], OFFSET = 50, SATURATION = [0.8, 2], HUE = 20;
// Smaller differences aren't visible, so the video is left untouched.
const MIN_LUMA_CHANGE = 3, MIN_SATURATION_CHANGE = 0.06, MIN_HUE_CHANGE = 3;

const clamp = (value: number, [min, max]: number[]) => Math.min(max, Math.max(min, value));

type Stats = { mean: number; spread: number; chroma: number; hueX: number; hueY: number };

// BT.709 luma and colour-difference, from 8-bit RGB samples.
function stats(pixels: Uint8Array): Stats {
  const count = Math.floor(pixels.length / 3);
  let sum = 0, squares = 0, chroma = 0, hueX = 0, hueY = 0;
  for (let i = 0; i < count; i++) {
    const r = pixels[i * 3], g = pixels[i * 3 + 1], b = pixels[i * 3 + 2];
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const cb = (b - y) / 1.8556, cr = (r - y) / 1.5748;
    const c = Math.hypot(cb, cr);
    sum += y; squares += y * y; chroma += c;
    // Chroma-weighted hue direction: vivid colours (a painted backdrop) count most.
    hueX += cb; hueY += cr;
  }
  const mean = sum / count;
  return { mean, spread: Math.sqrt(Math.max(0, squares / count - mean * mean)), chroma: chroma / count, hueX, hueY };
}

/**
 * Grade that maps the result's overall look onto the source's.
 * Returns null when they already match closely enough.
 */
export function colorCorrection(source: Uint8Array, result: Uint8Array): ColorCorrection | null {
  if (source.length < 300 || result.length < 300) return null;
  const want = stats(source), have = stats(result);
  const gain = have.spread < 4 ? 1 : clamp(want.spread / have.spread, GAIN);
  const offset = clamp(want.mean - gain * have.mean, [-OFFSET, OFFSET]);
  const saturation = have.chroma < 2 ? 1 : clamp(want.chroma / have.chroma, SATURATION);
  const turn = (Math.atan2(want.hueY, want.hueX) - Math.atan2(have.hueY, have.hueX)) * 180 / Math.PI;
  const hue = clamp(((turn + 540) % 360) - 180, [-HUE, HUE]);
  const lumaChange = Math.max(...[16, 128, 235].map((v) => Math.abs(v * gain + offset - v)));
  if (lumaChange < MIN_LUMA_CHANGE && Math.abs(saturation - 1) < MIN_SATURATION_CHANGE && Math.abs(hue) < MIN_HUE_CHANGE)
    return null;
  return { gain, offset, saturation, hue };
}

/** ffmpeg filters applying the correction to 8-bit limited-range YUV. */
export function correctionFilter({ gain, offset, saturation, hue }: ColorCorrection) {
  // Full-range luma math expressed on limited-range (16–235) values.
  const y = `clip((val-16)*${gain.toFixed(4)}+16+${(offset * 219 / 255).toFixed(2)}\\,16\\,235)`;
  return `format=yuv420p,lutyuv=y=${y},hue=h=${hue.toFixed(2)}:s=${saturation.toFixed(4)}`;
}

// Well inside the 300-second function limit, leaving time to save the result.
const FFMPEG_TIMEOUT = 150000;

function run(ffmpeg: string, args: string[], collect = false) {
  return new Promise<Buffer>((resolve, reject) => {
    const child = spawn(ffmpeg, ["-hide_banner", "-loglevel", "error", "-nostdin", ...args], {
      stdio: ["ignore", "pipe", "pipe"], timeout: FFMPEG_TIMEOUT, killSignal: "SIGKILL",
    });
    const out: Buffer[] = [], err: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => { if (collect) out.push(chunk); });
    child.stderr.on("data", (chunk: Buffer) => err.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => code === 0
      ? resolve(Buffer.concat(out))
      : reject(new Error(`ffmpeg exited with ${code}: ${Buffer.concat(err).toString().slice(-300)}`)));
  });
}

/** Small RGB frames sampled across the whole clip, for color statistics. */
export function sampleColors(ffmpeg: string, input: string) {
  return run(ffmpeg, [
    // Give up on a stalled download rather than waiting for the overall timeout.
    ...(/^https?:/.test(input) ? ["-rw_timeout", "30000000"] : []),
    "-i", input, "-an",
    "-vf", `fps=2,scale=${SAMPLE_SIZE},format=rgb24`,
    "-f", "rawvideo", "pipe:1",
  ], true);
}

/**
 * Writes `output` as `result` with its colors matched to `source` (a path or URL).
 * Returns false, writing nothing, when the colors already match.
 */
export async function matchColors(ffmpeg: string, result: string, source: string, output: string) {
  const [sourcePixels, resultPixels] = await Promise.all([sampleColors(ffmpeg, source), sampleColors(ffmpeg, result)]);
  const correction = colorCorrection(sourcePixels, resultPixels);
  if (!correction) return false;
  await run(ffmpeg, [
    "-y", "-i", result,
    "-map", "0:v:0", "-map", "0:a?",
    // The grade works on 8-bit values; some models deliver 10-bit video.
    "-vf", `${correctionFilter(correction)},format=yuv420p`,
    // H.264 plays everywhere; the bitrate cap keeps a 30-second 1080p video within storage limits.
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-maxrate", "10M", "-bufsize", "20M",
    "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
    "-c:a", "copy", "-movflags", "+faststart",
    output,
  ]);
  return true;
}

/**
 * `video` with its colors matched to the source clip at `sourceUrl`. Falls back to
 * `video` unchanged if the colors already match or matching can't finish, so a
 * finished video is always saved.
 */
export async function matchVideoColors(video: Blob, sourceUrl: string, maxBytes: number): Promise<Blob> {
  const id = randomUUID();
  const input = join(tmpdir(), `reelform-${id}-in.mp4`), output = join(tmpdir(), `reelform-${id}-out.mp4`);
  try {
    const { default: ffmpeg } = await import("ffmpeg-static");
    if (!ffmpeg) throw new Error("ffmpeg is unavailable on this platform");
    await writeFile(input, new Uint8Array(await video.arrayBuffer()));
    if (!(await matchColors(ffmpeg, input, sourceUrl, output))) return video;
    if ((await stat(output)).size > maxBytes) throw new Error("Color-matched video exceeds the storage limit");
    return new Blob([new Uint8Array(await readFile(output))], { type: "video/mp4" });
  } catch (error) {
    console.error("Color matching skipped", { reason: error instanceof Error ? error.message.slice(0, 200) : "UnknownError" });
    return video;
  } finally {
    await Promise.all([rm(input, { force: true }), rm(output, { force: true })]);
  }
}
