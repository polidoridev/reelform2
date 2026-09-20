import { z } from "zod";
import {
  authorize,
  verify,
  provider,
  sign,
  errorResponse,
  readJson,
  ApiError,
  MODEL,
} from "@/lib/higgsfield";
const input = z.object({
  videoToken: z.string().min(1).max(12000),
  imageTokens: z.array(z.string().max(12000)).max(4),
  prompt: z.string().trim().min(10).max(2000),
  resolution: z.enum(["480p", "720p"]),
  generateAudio: z.boolean(),
  consent: z.literal(true),
});
export async function POST(request: Request) {
  try {
    const user = await authorize(request);
    const parsed = input.safeParse(await readJson(request));
    if (!parsed.success)
      throw new ApiError(
        "Add a video, a prompt of 10 to 2,000 characters, and confirm you can use this footage.",
      );
    const { videoToken, imageTokens, prompt, resolution, generateAudio } =
      parsed.data;
    const video = await verify(videoToken, user, "upload");
    const images = await Promise.all(
      imageTokens.map((token) => verify(token, user, "upload")),
    );
    if (
      video.media !== "video" ||
      images.some((image) => image.media !== "image")
    )
      throw new ApiError(
        "The media types do not match. Please upload your files again.",
      );
    const data = await provider<{ request_id: string; status: string }>(MODEL, {
      method: "POST",
      body: JSON.stringify({
        prompt,
        video_url: video.url,
        ...(images.length
          ? { image_urls: images.map((image) => image.url) }
          : {}),
        resolution,
        bitrate_mode: "standard",
        generate_audio: generateAudio,
      }),
    });
    if (
      typeof data.request_id !== "string" ||
      !z.string().uuid().safeParse(data.request_id).success
    )
      throw new ApiError(
        "The request was sent, but its tracking ID was not returned. Check your Higgsfield account before submitting again.",
        502,
      );
    const token = await sign({
      user,
      kind: "job",
      id: data.request_id,
      exp: Date.now() + 7 * 86400000,
    });
    return Response.json({
      token,
      status: data.status || "queued",
      requestId: data.request_id,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
