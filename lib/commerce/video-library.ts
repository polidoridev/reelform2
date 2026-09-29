import { after } from "next/server";
import { admin, checked } from "@/lib/supabase/server";
import { getVideoModel } from "@/lib/video-models";
import type { JobRow } from "./types";
export const VIDEO_BUCKET = "reelform-creations";
export const MAX_SAVED_VIDEO_BYTES = 50 * 1024 * 1024;
export const libraryUrl = (id: string) => `/api/videos/${id}`;

// Longer than the 300-second function limit, so a lease only lapses once its work has stopped.
const PROCESSING_LEASE_MS = 6 * 60000;

function matchesColors(job: JobRow) {
  try {
    return !!job.input?.videoUrl?.startsWith("https://") && !!getVideoModel(job.input.model ?? "").matchColors;
  } catch {
    return false;
  }
}

// Exactly one request at a time may process a finished video.
async function claimProcessing(job: JobRow) {
  const now = new Date();
  const { data } = await checked(
    admin()
      .from("rf_jobs")
      .update({ processing_until: new Date(now.getTime() + PROCESSING_LEASE_MS).toISOString() })
      .eq("id", job.id)
      .eq("status", "completed")
      .neq("result_url", libraryUrl(job.id))
      .or(`processing_until.is.null,processing_until.lt.${now.toISOString()}`)
      .select("id"),
  );
  return !!data?.length;
}

// Only server-verified provider results enter this function. The bucket is
// private; playback is authorized against rf_jobs before issuing a signed URL.
export async function archiveVideo(job: JobRow): Promise<JobRow> {
  if (job.status !== "completed" || !job.result_url || job.result_url === libraryUrl(job.id)) return job;
  if (!matchesColors(job)) return saveVideo(job);
  // Color matching re-encodes the video, which outlasts a status check. One request
  // claims it and finishes after responding; until then the video is still generating.
  // A failed attempt is retried by the next check once its lease lapses.
  if (await claimProcessing(job)) after(() => saveVideo(job));
  return { ...job, status: "in_progress", result_url: null };
}

async function saveVideo(job: JobRow): Promise<JobRow> {
  try {
    if (!job.user_id) throw new Error("Missing video owner");
    if (!job.result_url) throw new Error("Missing provider output");
    const source = new URL(job.result_url);
    if (source.protocol !== "https:") throw new Error("Invalid provider output URL");
    const response = await fetch(source, { redirect: "manual", signal: AbortSignal.timeout(60000) });
    if (!response.ok || !response.body) throw new Error("Provider output unavailable");
    let size = Number(response.headers.get("content-length"));
    if (!size || size > MAX_SAVED_VIDEO_BYTES) {
      await response.body.cancel();
      throw new Error("Output exceeds storage limit or size is unavailable");
    }
    let received = 0;
    let body = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        received += chunk.byteLength;
        if (received > size || received > MAX_SAVED_VIDEO_BYTES) throw new Error("Invalid output size");
        controller.enqueue(chunk);
      },
      flush() { if (received !== size) throw new Error("Incomplete output"); },
    }));
    let video: Blob | null = null;
    if (matchesColors(job)) {
      const { matchVideoColors } = await import("../color-match");
      video = await matchVideoColors(await new Response(body).blob(), job.input!.videoUrl!, MAX_SAVED_VIDEO_BYTES);
      size = video.size;
      body = video.stream();
    }
    if (job.input?.preserveOriginalAudio) {
      if (!job.input.videoUrl || !job.input.videoUrl.startsWith("https://")) throw new Error("Missing original video");
      const [{ preserveVideoAudio }, { UrlSource }] = await Promise.all([
        import("../preserve-video-audio"), import("mediabunny"),
      ]);
      const merged = await preserveVideoAudio(video ?? await new Response(body).blob(), new UrlSource(job.input.videoUrl, {
        maxCacheSize: 4 * 1024 * 1024,
        fetchFn: (url, init) => fetch(url, { ...init, redirect: "manual", signal: AbortSignal.any([...(init?.signal ? [init.signal] : []), AbortSignal.timeout(60000)]) }),
      }), MAX_SAVED_VIDEO_BYTES);
      size = merged.size;
      body = merged.stream();
    }
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
    // Retry on future account/status checks if processing or storage is unavailable.
    console.error("Video archive pending", { jobId: job.id, reason: error instanceof Error ? error.name : "UnknownError" });
    // Keep polling until the soundtrack is saved; never offer a silent fallback.
    return job.input?.preserveOriginalAudio ? { ...job, status: "in_progress", result_url: null } : job;
  }
}
