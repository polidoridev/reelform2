import { archiveVideo } from "./video-library";
import type { JobRow } from "./types";
import { provider } from "@/lib/higgsfield";
import { admin, checked } from "@/lib/supabase/server";
import { generationFailureMessage } from "./generation-errors";
export async function refreshJob(job: JobRow) {
  if (job.status === "completed") return archiveVideo(job);
  if (!job.provider_id || job.status === "failed")
    return job;
  const r = await provider<{ status: string; error?: unknown; video?: { url: string } }>(
    `requests/${encodeURIComponent(job.provider_id)}/status`,
  );
  const status =
    r.status === "completed"
      ? "completed"
      : ["failed", "nsfw", "canceled"].includes(r.status)
        ? "failed"
        : ["queued", "pending", "waiting"].includes(r.status)
          ? "queued"
          : "in_progress";
  const url = r.video?.url?.startsWith("https://") ? r.video.url : null;
  if (status === "completed" && !url) return job;
  const error = status === "failed"
    ? generationFailureMessage(r.status, r.error, job.credits)
    : null;
  await checked(
    admin().rpc("rf_finish_job", {
      p_job: job.id,
      p_status: status,
      p_url: url,
      p_error: error,
    }),
  );
  return archiveVideo({
    ...job,
    status,
    result_url: url,
    error,
  });
}
