import { admin, checked } from "@/lib/supabase/server";
import type { JobRow } from "./types";
export const VIDEO_BUCKET = "reelform-creations";
export const MAX_SAVED_VIDEO_BYTES = 50 * 1024 * 1024;
export const libraryUrl = (id: string) => `/api/videos/${id}`;

// Only server-verified provider results enter this function. The bucket is
// private; playback is authorized against rf_jobs before issuing a signed URL.
export async function archiveVideo(job: JobRow): Promise<JobRow> {
  if (job.status !== "completed" || !job.result_url || job.result_url === libraryUrl(job.id)) return job;
  try {
    if (!job.user_id) throw new Error("Missing video owner");
    const source = new URL(job.result_url);
    if (source.protocol !== "https:") throw new Error("Invalid provider output URL");
    const response = await fetch(source, { redirect: "manual", signal: AbortSignal.timeout(60000) });
    if (!response.ok || !response.body) throw new Error("Provider output unavailable");
    const size = Number(response.headers.get("content-length"));
    if (!size || size > MAX_SAVED_VIDEO_BYTES) {
      await response.body.cancel();
      throw new Error("Output exceeds storage limit or size is unavailable");
    }
    let received = 0;
    const body = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        received += chunk.byteLength;
        if (received > size || received > MAX_SAVED_VIDEO_BYTES) throw new Error("Invalid output size");
        controller.enqueue(chunk);
      },
      flush() { if (received !== size) throw new Error("Incomplete output"); },
    }));
    const path = `${job.user_id}/${job.id}.mp4`;
    const uploaded = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/${VIDEO_BUCKET}/${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!, "Content-Type": "video/mp4", "Content-Length": String(size), "x-upsert": "true" },
      body, duplex: "half", signal: AbortSignal.timeout(60000),
    } as RequestInit);
    if (!uploaded.ok) { await uploaded.body?.cancel(); throw new Error("Private video storage unavailable"); }
    await uploaded.body?.cancel();
    const result_url = libraryUrl(job.id);
    await checked(admin().from("rf_jobs").update({ result_url }).eq("id", job.id).eq("user_id", job.user_id));
    return { ...job, result_url };
  } catch (error) {
    // Preserve the playable original and retry on future account/status checks.
    console.error("Video archive pending", { jobId: job.id, reason: error instanceof Error ? error.name : "UnknownError" });
    return job;
  }
}
