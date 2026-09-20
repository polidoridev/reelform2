import type { JobRow } from "./types";
import { provider } from "@/lib/higgsfield";
import { admin, checked } from "@/lib/supabase/server";
export async function refreshJob(job: JobRow) {
  if (!job.provider_id || ["completed", "failed"].includes(job.status))
    return job;
  const r = await provider<{ status: string; video?: { url: string } }>(
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
  await checked(
    admin().rpc("rf_finish_job", {
      p_job: job.id,
      p_status: status,
      p_url: url,
      p_error:
        status === "failed"
          ? "The video could not complete. Your credits were returned."
          : null,
    }),
  );
  return {
    ...job,
    status,
    result_url: url,
    error:
      status === "failed"
        ? "The video could not complete. Your credits were returned."
        : null,
  };
}
