import { inspectWebm } from "./webm";
import { MAX_VIDEO_BYTES, MIN_VIDEO_SECONDS, MAX_VIDEO_SECONDS } from "../video-limits";
import { ApiError } from "@/lib/http";
import type { MediaInfo } from "./pricing";
// Inspect container metadata from provider-owned upload URLs. Skip media payloads rather than
// loading an entire upload into a serverless worker's memory.
export async function inspectVideo(
  url: string,
  declaredBytes: number,
): Promise<MediaInfo> {
  if (
    !Number.isSafeInteger(declaredBytes) ||
    declaredBytes < 8 ||
    declaredBytes > MAX_VIDEO_BYTES
  )
    throw new ApiError("Invalid upload size.");
  let used = 0;
  async function range(start: number, end: number) {
    if (end >= declaredBytes || end < start || end - start > 4 * 1024 * 1024)
      throw new ApiError("This video has an unsupported video structure.");
    const r = await fetch(url, {
      headers: { Range: `bytes=${start}-${end}` },
      signal: AbortSignal.timeout(20000),
      // Workers do not implement redirect: "error". Manual keeps redirects
      // blocked by the strict 206 check below without following another host.
      redirect: "manual",
    });
    if (
      r.status !== 206 ||
      r.headers.get("content-range") !==
        `bytes ${start}-${end}/${declaredBytes}`
    ) {
      await r.body?.cancel();
      throw new ApiError(
        "Could not verify the uploaded video. Please export a standard MP4 or MOV and try again.",
      );
    }
    const reader = r.body!.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.length;
        used += value.length;
        if (length > end - start + 1 || used > 6 * 1024 * 1024)
          throw new ApiError("Video metadata is too large.");
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
    }
    if (length !== end - start + 1)
      throw new ApiError("The upload is incomplete.");
    const out = new Uint8Array(length);
    let at = 0;
    for (const c of chunks) {
      out.set(c, at);
      at += c.length;
    }
    return out;
  }
  const signature = await range(0, Math.min(15, declaredBytes - 1));
  if (new DataView(signature.buffer).getUint32(0) === 0x1a45dfa3)
    return inspectWebm(range, declaredBytes);
  const text = (a: Uint8Array, n: number) =>
    String.fromCharCode(...a.slice(n, n + 4));
  function size(a: Uint8Array, n: number) {
    const d = new DataView(a.buffer, a.byteOffset, a.byteLength);
    const s = d.getUint32(n);
    if (s === 1) {
      const big = d.getBigUint64(n + 8);
      if (big > BigInt(MAX_VIDEO_BYTES))
        throw new ApiError("Video box too large.");
      return Number(big);
    }
    return s;
  }
  let moov: Uint8Array | undefined;
  let offset = 0;
  for (let i = 0; i < 128 && offset + 8 <= declaredBytes; i++) {
    const header = await range(
      offset,
      Math.min(offset + 15, declaredBytes - 1),
    );
    const n = size(header, 0);
    if (n < 8 || offset + n > declaredBytes)
      throw new ApiError("Invalid video file.");
    if (text(header, 4) === "moov") {
      moov = await range(offset, offset + n - 1);
      break;
    }
    offset += n;
  }
  if (!moov) throw new ApiError("No video metadata found.");
  type Box = { type: string; start: number; end: number; body: number };
  function boxes(start: number, end: number): Box[] {
    const result: Box[] = [];
    for (let at = start; at + 8 <= end;) {
      const n = size(moov!, at);
      if (n < 8 || at + n > end) throw new ApiError("Invalid video metadata.");
      const extended = new DataView(moov!.buffer).getUint32(at) === 1;
      result.push({
        type: text(moov!, at + 4),
        start: at,
        end: at + n,
        body: at + (extended ? 16 : 8),
      });
      at += n;
      if (result.length > 10000) throw new ApiError("Too many video boxes.");
    }
    return result;
  }
  const view = new DataView(moov.buffer, moov.byteOffset, moov.byteLength);
  function seconds(box: Box) {
    const v = moov![box.body];
    const scale = view.getUint32(box.body + (v === 1 ? 20 : 12));
    const d =
      v === 1
        ? Number(view.getBigUint64(box.body + 24))
        : view.getUint32(box.body + 16);
    return d / scale;
  }
  const root = boxes(0, moov.length)[0];
  const children = boxes(root.body, root.end);
  const movie = children.find((b) => b.type === "mvhd");
  let duration = movie ? seconds(movie) : 0,
    width = 0,
    height = 0;
  for (const track of children.filter((b) => b.type === "trak")) {
    const parts = boxes(track.body, track.end);
    const mdia = parts.find((b) => b.type === "mdia"),
      tkhd = parts.find((b) => b.type === "tkhd");
    if (!mdia || !tkhd) continue;
    const media = boxes(mdia.body, mdia.end);
    const handler = media.find((b) => b.type === "hdlr"),
      mdhd = media.find((b) => b.type === "mdhd");
    if (!handler || text(moov, handler.body + 8) !== "vide" || !mdhd) continue;
    duration = Math.max(duration, seconds(mdhd));
    width = Math.max(width, view.getUint32(tkhd.end - 8) / 65536);
    height = Math.max(height, view.getUint32(tkhd.end - 4) / 65536);
  }
  if (
    !Number.isFinite(duration) ||
    !width ||
    !height ||
    duration < MIN_VIDEO_SECONDS ||
    duration > MAX_VIDEO_SECONDS
  )
    throw new ApiError("Use a standard MP4, MOV, M4V, or WebM video between 4 and 30 seconds.");
  return { duration, width, height, bytes: declaredBytes };
}

// Compatibility for existing callers; both ISO-BMFF and QuickTime use these boxes.
export const inspectMp4 = inspectVideo;
