import { z } from "zod";
import {
  authorize,
  provider,
  sign,
  errorResponse,
  readJson,
  ApiError,
} from "@/lib/higgsfield";
const input = z.object({
  contentType: z.enum(["video/mp4", "image/jpeg", "image/png", "image/webp"]),
  size: z
    .number()
    .positive()
    .max(100 * 1024 * 1024),
});
export async function POST(request: Request) {
  try {
    const user = await authorize(request);
    const parsed = input.safeParse(await readJson(request));
    if (!parsed.success)
      throw new ApiError(
        "Use an MP4 video up to 100 MB or a JPG, PNG, or WebP reference up to 10 MB.",
      );
    const { contentType, size } = parsed.data;
    if (contentType.startsWith("image/") && size > 10 * 1024 * 1024)
      throw new ApiError("Each reference image must be 10 MB or smaller.");
    const data = await provider<{
      upload_url: string;
      public_url: string;
      upload_headers: Record<string, string>;
    }>("files/generate-upload-url", {
      method: "POST",
      body: JSON.stringify({ content_type: contentType }),
    });
    if (
      typeof data.upload_url !== "string" ||
      typeof data.public_url !== "string" ||
      !data.upload_headers
    )
      throw new ApiError(
        "The upload service returned an incomplete response.",
        502,
      );
    const token = await sign({
      user,
      kind: "upload",
      url: data.public_url,
      bytes: size,
      media: contentType.startsWith("video/") ? "video" : "image",
      exp: Date.now() + 3600000,
    });
    return Response.json({
      uploadUrl: data.upload_url,
      headers: data.upload_headers,
      token,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
