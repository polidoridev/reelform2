import { admin, checked } from "@/lib/supabase/server";
import { ApiError } from "@/lib/http";
import { LIBRARY_BUCKET } from "./upload-library";
import { MAX_VIDEO_BYTES } from "../video-limits";
import type { GenerationAsset } from "./generation-chat";

export type StoredInput = Omit<GenerationAsset, "url"> & { path: string };
export type GenerationInput = {
  trial?: boolean;
  model?: string;
  videoUrl?: string | null;
  imageUrls?: string[];
  generateAudio?: boolean;
  aspectRatio?: string;
  media?: { duration?: number; bytes?: number };
  parentJobId?: string | null;
  sourceNames?: { video?: string; images?: string[] };
  sourceTypes?: { video?: string; images?: string[] };
  sourceBytes?: { video?: number; images?: number[] };
  savedInputs?: StoredInput[];
};
export type InputJob = { id: string; user_id: string; input: GenerationInput };
const extensions: Record<string, string> = { "video/mp4": "mp4", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
export function sourceInputs(input: GenerationInput) {
  return [
    ...(input.videoUrl ? [{ slot: "video", url: input.videoUrl, name: input.sourceNames?.video || "Original video.mp4", type: input.sourceTypes?.video || "video/mp4", bytes: input.sourceBytes?.video ?? input.media?.bytes }] : []),
    ...(input.imageUrls ?? []).map((url, index) => ({ slot: `image-${index + 1}`, url, name: input.sourceNames?.images?.[index] || `Reference ${index + 1}`, type: input.sourceTypes?.images?.[index], bytes: input.sourceBytes?.images?.[index] })),
  ];
}
export function inputAssets(job: InputJob): GenerationAsset[] {
  const sources = sourceInputs(job.input);
  return sources.map(source => {
    const saved = job.input.savedInputs?.find(file => file.slot === source.slot);
    return { slot: source.slot, name: saved?.name ?? source.name, type: saved?.type ?? source.type ?? "image/jpeg", bytes: saved?.bytes ?? source.bytes ?? 0, url: `/api/generations/${job.id}/inputs/${source.slot}` };
  });
}

/** Stream each verified source to private storage before sending a paid request.
 * Flat job-specific paths survive library pruning, and account deletion removes them.
 */
export async function archiveGenerationInputs(job: InputJob) {
  if (job.input.savedInputs) return job.input;
  const db = admin();
  const savedInputs: StoredInput[] = [];
  // Leave time in the route's 300s budget to refund a failed archive or submit
  // and record the provider request, even when several large inputs are saved.
  const deadline = AbortSignal.timeout(210000);
  for (const source of sourceInputs(job.input)) {
    const remote = new URL(source.url);
    if (remote.protocol !== "https:") throw new Error("Invalid input URL");
    let response: Response | null = null;
    try { response = await fetch(remote, { redirect: "manual", signal: AbortSignal.any([deadline, AbortSignal.timeout(120000)]) }); } catch { /* Try the private upload library for older jobs. */ }
    if (!response?.ok || !response.body) {
      await response?.body?.cancel();
      const { data: library } = await checked(db.from("rf_library").select("storage_path").eq("user_id", job.user_id).eq("provider_url", source.url).limit(1).maybeSingle());
      if (!library) throw new Error("Original upload unavailable");
      const { data: signed, error } = await db.storage.from(LIBRARY_BUCKET).createSignedUrl(library.storage_path, 3600);
      if (error || !signed?.signedUrl) throw new Error("Original upload unavailable");
      response = await fetch(signed.signedUrl, { redirect: "manual", signal: AbortSignal.any([deadline, AbortSignal.timeout(120000)]) });
    }
    if (!response.ok || !response.body) { await response.body?.cancel(); throw new Error("Original upload unavailable"); }
    const type = source.type ?? response.headers.get("content-type")?.split(";")[0] ?? "";
    const bytes = Number(response.headers.get("content-length"));
    const max = source.slot === "video" ? MAX_VIDEO_BYTES : 10 * 1024 * 1024;
    if (!extensions[type] || (source.slot === "video") !== type.startsWith("video/") || !Number.isSafeInteger(bytes) || bytes <= 0 || bytes > max || (source.bytes && bytes !== source.bytes)) {
      await response.body.cancel(); throw new Error("Original upload size or type does not match");
    }
    let received = 0;
    const body = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) { received += chunk.byteLength; if (received > bytes) throw new Error("Input exceeded its declared size"); controller.enqueue(chunk); },
      flush() { if (received !== bytes) throw new Error("Incomplete original upload"); },
    }));
    const path = `${job.user_id}/job-${job.id}-${source.slot}.${extensions[type]}`;
    const stored = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/${LIBRARY_BUCKET}/${path}`, {
      method: "POST", headers: { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!, "Content-Type": type, "Content-Length": String(bytes), "x-upsert": "true" },
      body, duplex: "half", signal: deadline,
    } as RequestInit);
    await stored.body?.cancel();
    if (!stored.ok) throw new Error("Original upload could not be saved");
    savedInputs.push({ slot: source.slot, name: source.name, type, bytes, path });
  }
  const input = { ...job.input, savedInputs };
  await checked(db.from("rf_jobs").update({ input }).eq("id", job.id).eq("user_id", job.user_id));
  return input;
}

/** Owned, durable media URL; legacy jobs can still use their library/provider copy. */
export async function generationInputUrl(job: InputJob, slot: string) {
  const source = sourceInputs(job.input).find(file => file.slot === slot);
  if (!source) throw new ApiError("Original upload not found.", 404);
  const db = admin();
  const saved = job.input.savedInputs?.find(file => file.slot === slot);
  let path = saved?.path;
  if (path && !path.startsWith(`${job.user_id}/job-${job.id}-`)) throw new ApiError("Original upload not found.", 404);
  if (!path) {
    const { data } = await checked(db.from("rf_library").select("storage_path").eq("user_id", job.user_id).eq("provider_url", source.url).limit(1).maybeSingle());
    path = data?.storage_path;
  }
  if (path) {
    const { data, error } = await db.storage.from(LIBRARY_BUCKET).createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) throw new ApiError("This original upload could not be opened.", 503);
    return data.signedUrl;
  }
  // Old generations have no durable copy if their original provider upload expired.
  if (!source.url.startsWith("https://")) throw new ApiError("Original upload unavailable.", 404);
  return source.url;
}
