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
        resolution: z.enum(["480p", "720p"]),
      })
      .parse(await readJson(request));
    const video = await verify(body.videoToken, user, "upload");
    if (video.media !== "video") throw new ApiError("Upload a video first.");
    const media = await inspectVideo(video.url, video.bytes);
    let quote: ReturnType<typeof quoteVideo>;
    try {
      quote = quoteVideo(media, body.resolution);
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
    return errorResponse(
      error instanceof z.ZodError
        ? new ApiError("Invalid quote request.")
        : error,
    );
  }
}
