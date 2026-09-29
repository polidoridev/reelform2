import { videoEntitlements, validateVideoEntitlements } from "@/lib/commerce/entitlements";
import { ASPECT_RATIOS, DEFAULT_VIDEO_MODEL, getVideoModel, validateModel } from "@/lib/video-models";
import { requireUser, accountFor, isReelformAdmin } from "@/lib/supabase/server";
import { z } from "zod";
import { verify, sign } from "@/lib/higgsfield";
import { ApiError, readJson, errorResponse, noStore } from "@/lib/http";
import { inspectVideo } from "@/lib/commerce/media";
import { quoteCreation, quoteVideo, type MediaInfo } from "@/lib/commerce/pricing";
export async function POST(request: Request) {
  try {
    const authenticatedUser = await requireUser(request);
    const user = authenticatedUser.id;
    const body = z
      .object({
        // Omitted when creating from a prompt and photos with a video-optional model.
        videoToken: z.string().max(12000).optional(),
        duration: z.number().int().min(4).max(30).optional(),
        aspectRatio: z.enum(ASPECT_RATIOS).optional(),
        resolution: z.enum(["480p", "720p", "1080p"]),
        model: z.string().max(80).default(DEFAULT_VIDEO_MODEL),
        imageCount: z.number().int().min(0).max(4).default(0),
        generateAudio: z.boolean().default(false),
      })
      .parse(await readJson(request));
    const account = await accountFor(authenticatedUser);
    let videoUrl: string | null = null;
    let media: MediaInfo;
    if (body.videoToken) {
      const video = await verify(body.videoToken, user, "upload");
      if (video.media !== "video") throw new ApiError("Upload a video first.");
      videoUrl = video.url;
      media = await inspectVideo(video.url, video.bytes);
    } else {
      if (!body.duration || !body.aspectRatio)
        throw new ApiError("Choose a length and shape for your video.");
      media = { duration: body.duration, width: 0, height: 0, bytes: 0 };
    }
    let quote: ReturnType<typeof quoteVideo>;
    try {
      validateVideoEntitlements(videoEntitlements(account, isReelformAdmin(authenticatedUser)), { ...body, duration: media.duration });
      validateModel(getVideoModel(body.model), body.resolution, media.duration, body.imageCount, body.generateAudio, !!videoUrl);
      if (videoUrl) quote = quoteVideo(media, body.resolution, body.model);
      else {
        const created = quoteCreation(media.duration, body.resolution, body.aspectRatio!, body.model);
        media = created.media;
        quote = created;
      }
    } catch (error) {
      throw new ApiError(
        error instanceof Error ? error.message : "This clip cannot be quoted.",
      );
    }
    if (isReelformAdmin(authenticatedUser)) quote.credits = 0;
    const token = await sign({
      user,
      kind: "quote",
      url: videoUrl,
      aspectRatio: videoUrl ? undefined : body.aspectRatio,
      credits: quote.credits,
      resolution: body.resolution,
      model: body.model,
      media,
      exp: Date.now() + 15 * 60000,
    });
    return noStore({
      quoteToken: token,
      credits: quote.credits,
      duration: quote.duration,
      resolution: quote.resolution,
    });
  } catch (error) {
    if (!(error instanceof ApiError) && !(error instanceof z.ZodError)) {
      console.error("Quote verification failed", error instanceof Error ? {
        name: error.name,
        message: error.message.replace(/https?:\/\/[^\s]+/g, "[media URL]"),
        stack: error.stack?.split("\n").slice(1, 4).join("\n"),
      } : { name: "UnknownError" });
    }
    return errorResponse(
      error instanceof z.ZodError
        ? new ApiError("Invalid quote request.")
        : error,
    );
  }
}
