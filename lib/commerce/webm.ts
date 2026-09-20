import { ApiError } from "@/lib/http";
import { MIN_VIDEO_SECONDS, MAX_VIDEO_SECONDS } from "../video-limits";

const invalid = () => new ApiError("This WebM has incomplete or unsupported metadata. Export it as MP4 or MOV and try again.");
type Element = { id: number; body: number; end: number; unknown: boolean };
function element(data: Uint8Array, at: number, limit: number): Element {
  let cursor = at;
  function vint(id: boolean) {
    const first = data[cursor++];
    if (!first) throw invalid();
    let length = 1, mask = 128;
    while (!(first & mask)) { length++; mask >>= 1; }
    if (length > (id ? 4 : 8) || cursor + length - 1 > data.length) throw invalid();
    let value = BigInt(id ? first : first & (mask - 1));
    for (let i = 1; i < length; i++) value = (value << BigInt(8)) | BigInt(data[cursor++]);
    const unknown = !id && value === (BigInt(1) << BigInt(length * 7)) - BigInt(1);
    if (!unknown && value > BigInt(Number.MAX_SAFE_INTEGER)) throw invalid();
    return { value: Number(value), unknown };
  }
  const id = vint(true).value, size = vint(false);
  const end = size.unknown ? limit : cursor + size.value;
  if (end > limit || end < cursor) throw invalid();
  return { id, body: cursor, end, unknown: size.unknown };
}
function children(data: Uint8Array) {
  const result: Element[] = [];
  for (let at = 0; at < data.length;) {
    const e = element(data, at, data.length);
    if (e.unknown || result.length >= 1024) throw invalid();
    result.push(e); at = e.end;
  }
  return result;
}
function unsigned(data: Uint8Array) {
  if (!data.length || data.length > 6) throw invalid();
  return data.reduce((n, b) => n * 256 + b, 0);
}
export async function inspectWebm(range: (start: number, end: number) => Promise<Uint8Array>, bytes: number) {
  async function header(at: number, limit: number) {
    const data = await range(at, Math.min(at + 11, limit - 1));
    const e = element(data, 0, limit - at);
    return { ...e, body: e.body + at, end: e.end + at };
  }
  const ebml = await header(0, bytes);
  if (ebml.id !== 0x1a45dfa3 || ebml.unknown) throw invalid();
  const schema = await range(ebml.body, ebml.end - 1);
  const doc = children(schema).find(e => e.id === 0x4282);
  if (!doc || new TextDecoder().decode(schema.slice(doc.body, doc.end)) !== "webm") throw invalid();
  const segment = await header(ebml.end, bytes);
  if (segment.id !== 0x18538067) throw invalid();
  let scale = 1000000, ticks = 0, width = 0, height = 0, infoFound = false, tracksFound = false;
  for (let at = segment.body, count = 0; at < segment.end && count < 256; count++) {
    const e = await header(at, segment.end);
    if (e.unknown) throw invalid();
    if (e.id === 0x1549a966) {
      if (infoFound) throw invalid();
      infoFound = true;
      const data = await range(e.body, e.end - 1);
      for (const part of children(data)) {
        const value = data.slice(part.body, part.end);
        if (part.id === 0x2ad7b1) scale = unsigned(value);
        if (part.id === 0x4489) {
          const view = new DataView(value.buffer, value.byteOffset, value.byteLength);
          if (value.length !== 4 && value.length !== 8) throw invalid();
          ticks = value.length === 4 ? view.getFloat32(0) : view.getFloat64(0);
        }
      }
    }
    if (e.id === 0x1654ae6b) {
      if (tracksFound) throw invalid();
      tracksFound = true;
      const data = await range(e.body, e.end - 1);
      for (const track of children(data).filter(t => t.id === 0xae)) {
        const entry = data.slice(track.body, track.end), fields = children(entry);
        const type = fields.find(t => t.id === 0x83), video = fields.find(t => t.id === 0xe0);
        if (!type || unsigned(entry.slice(type.body, type.end)) !== 1 || !video) continue;
        const dimensions = entry.slice(video.body, video.end);
        for (const dim of children(dimensions)) {
          if (dim.id === 0xb0) width = Math.max(width, unsigned(dimensions.slice(dim.body, dim.end)));
          if (dim.id === 0xba) height = Math.max(height, unsigned(dimensions.slice(dim.body, dim.end)));
        }
      }
    }
    if (infoFound && tracksFound) break;
    at = e.end;
  }
  const duration = ticks * scale / 1e9;
  if (!Number.isFinite(duration) || !width || !height || !scale || duration < MIN_VIDEO_SECONDS || duration > MAX_VIDEO_SECONDS) throw invalid();
  return { duration, width, height, bytes };
}
