import { z } from "zod";
import {
  authorize,
  verify,
  provider,
  errorResponse,
  ApiError,
} from "@/lib/higgsfield";
export async function GET(request: Request) {
  try {
    const user = await authorize(request);
    const token = new URL(request.url).searchParams.get("token");
    if (!token) throw new ApiError("A generation link is required.");
    const job = await verify(token, user, "job");
    if (!z.string().uuid().safeParse(job.id).success)
      throw new ApiError("Invalid generation ID.");
    const data = await provider<{ status: string; video?: { url: string } }>(
      `requests/${encodeURIComponent(job.id)}/status`,
    );
    const url = data.video?.url;
    return Response.json(
      {
        status: data.status,
        videoUrl:
          typeof url === "string" && url.startsWith("https://") ? url : null,
        error: ["failed", "nsfw", "canceled"].includes(data.status)
          ? "The generation could not complete. Try a simpler prompt or a different clip."
          : null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
