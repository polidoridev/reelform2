import { z } from "zod";
import { verify, provider, sign, MODEL, isConfigured } from "@/lib/higgsfield";
import { ApiError, readJson, errorResponse, noStore } from "@/lib/http";
import { requireUser, accountFor, admin, checked, isReelformAdmin } from "@/lib/supabase/server";
import { maybeReload, balances } from "@/lib/commerce/billing";
const input = z.object({
  videoToken: z.string().max(12000),
  quoteToken: z.string().max(16000),
  requestId: z.string().uuid(),
  imageTokens: z.array(z.string().max(12000)).max(4),
  prompt: z.string().trim().min(10).max(2000),
  resolution: z.enum(["480p", "720p"]),
  generateAudio: z.boolean(),
  consent: z.literal(true),
});
export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    if (!isConfigured())
      throw new ApiError("Video generation is not connected yet.", 503);
    const account = await accountFor(user);
    const p = input.parse(await readJson(request));
    const video = await verify(p.videoToken, user.id, "upload");
    const quote = await verify(p.quoteToken, user.id, "quote");
    const images = await Promise.all(
      p.imageTokens.map((t) => verify(t, user.id, "upload")),
    );
    if (
      video.media !== "video" ||
      images.some((i) => i.media !== "image") ||
      quote.url !== video.url ||
      quote.resolution !== p.resolution ||
      !Number.isSafeInteger(quote.credits) ||
      (quote.credits === 0 && !isReelformAdmin(user))
    )
      throw new ApiError(
        "Your video quote changed. Get a fresh quote before generating.",
      );
    const db = admin();
    const reserve = await db.rpc("rf_reserve_job", {
      p_user: user.id,
      p_client: p.requestId,
      p_credits: quote.credits,
      p_prompt: p.prompt,
      p_resolution: p.resolution,
      p_input: {
        videoUrl: video.url,
        imageUrls: images.map((i) => i.url),
        generateAudio: p.generateAudio,
        media: quote.media,
      },
    });
    if (reserve.error) {
      if (reserve.error.message.includes("INSUFFICIENT_CREDITS"))
        throw new ApiError(
          "You need more credits for this video. Add credits in your account.",
          402,
        );
      if (reserve.error.message.includes("CONCURRENCY_LIMIT"))
        throw new ApiError(
          "Wait for your current video to finish before starting another.",
          409,
        );
      if (reserve.error.message.includes("BILLING_HOLD"))
        throw new ApiError(
          "Your billing account needs review. Contact support.",
          403,
        );
      throw reserve.error;
    }
    const job = reserve.data;
    const { data: claimed } = await checked(
      db
        .from("rf_jobs")
        .update({ status: "submitting" })
        .eq("id", job.id)
        .eq("status", "reserved")
        .select("id")
        .maybeSingle(),
    );
    if (claimed) {
      try {
        const result = await provider<{ request_id: string; status: string }>(
          MODEL,
          {
            method: "POST",
            body: JSON.stringify({
              // Retries must use the input whose credits were reserved, even
              // if a client reuses its request ID with a different payload.
              prompt: job.prompt,
              video_url: job.input.videoUrl,
              ...(job.input.imageUrls.length
                ? { image_urls: job.input.imageUrls }
                : {}),
              resolution: job.resolution,
              bitrate_mode: "standard",
              generate_audio: job.input.generateAudio,
            }),
          },
        );
        if (!z.string().uuid().safeParse(result.request_id).success)
          throw new ApiError(
            "The provider did not return a tracking ID. Your request is being reviewed.",
            502,
          );
        await checked(
          db
            .from("rf_jobs")
            .update({
              provider_id: result.request_id,
              status: "queued",
              updated_at: new Date().toISOString(),
            })
            .eq("id", job.id),
        );
      } catch (error) {
        // A timeout or server error may have accepted the paid job. Hold the
        // reservation for reconciliation instead of refunding and submitting twice.
        const rejected = error instanceof ApiError && error.providerRejected;
        await checked(
          db.rpc("rf_finish_job", {
            p_job: job.id,
            p_status: rejected ? "failed" : "unknown",
            p_error: rejected
              ? "The provider rejected this video. Credits returned."
              : "The provider response was interrupted. Do not resubmit; contact support with this job ID.",
          }),
        );
      }
    }
    const { data: latest } = await checked(
      db.from("rf_jobs").select("*").eq("id", job.id).single(),
    );
    const token = await sign({
      user: user.id,
      kind: "job",
      id: job.id,
      exp: Date.now() + 30 * 86400000,
    });
    if (claimed && latest?.status === "queued" && account.auto_reload_enabled && !isReelformAdmin(user)) {
      try {
        await maybeReload(account);
      } catch {
        /* A pending order is reconciled by the maintenance worker. */
      }
    }
    return noStore({
      token,
      requestId: job.id,
      status: latest?.status,
      error: latest?.error,
      credits: job.credits,
      balance: (await balances(user.id)).total,
    });
  } catch (error) {
    return errorResponse(
      error instanceof z.ZodError
        ? new ApiError(
            "Check the video, current quote, and prompt before generating.",
          )
        : error,
    );
  }
}
