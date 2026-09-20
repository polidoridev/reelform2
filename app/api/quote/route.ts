import { DEFAULT_VIDEO_MODEL, getVideoModel, validateModel } from "@/lib/video-models";
import { requireUser, isReelformAdmin } from "@/lib/supabase/server";
import { z } from "zod";
import { verify, sign } from "@/lib/higgsfield";
import { ApiError, readJson, errorResponse, noStore } from "@/lib/http";
import { inspectVideo } from "@/lib/commerce/media";
import { quoteVideo } from "@/lib/commerce/pricing";
export async function POST(request: Request) {
  try {
    const authenticatedUser = await requireUser(request);
    const user = authenticatedUser.id;
    const body = z
      .object({
        videoToken: z.string().max(12000),
        resolution: z.enum(["480p", "720p", "1080p"]),
        model: z.string().max(80).default(DEFAULT_VIDEO_MODEL),
        imageCount: z.number().int().min(0).max(4).default(0),
        generateAudio: z.boolean().default(false),
      })
      .parse(await readJson(request));
    const video = await verify(body.videoToken, user, "upload");
    if (video.media !== "video") throw new ApiError("Upload a video first.");
    const media = await inspectVideo(video.url, video.bytes);
    let quote: ReturnType<typeof quoteVideo>;
    try {
      validateModel(getVideoModel(body.model), body.resolution, media.duration, body.imageCount, body.generateAudio);
      quote = quoteVideo(media, body.resolution, body.model);
    } catch (error) {
      throw new ApiError(
        error instanceof Error ? error.message : "This clip cannot be quoted.",
      );
    }
    if (isReelformAdmin(authenticatedUser)) quote.credits = 0;
    const token = await sign({
      user,
      kind: "quote",
      url: video.url,
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
