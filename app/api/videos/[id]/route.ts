import { requireUser, admin, checked } from "@/lib/supabase/server";
import { ApiError, errorResponse } from "@/lib/http";
import { VIDEO_BUCKET, libraryUrl } from "@/lib/commerce/video-library";
import { z } from "zod";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(request);
    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) throw new ApiError("Video not found.", 404);
    const db = admin();
    const { data: job } = await checked(db.from("rf_jobs").select("id,result_url,status").eq("id", id).eq("user_id", user.id).maybeSingle());
    if (!job || job.status !== "completed" || job.result_url !== libraryUrl(id)) throw new ApiError("Video not found.", 404);
    const { data, error } = await db.storage.from(VIDEO_BUCKET).createSignedUrl(`${user.id}/${id}.mp4`, 3600,
      new URL(request.url).searchParams.has("download") ? { download: `reelform-${id}.mp4` } : {});
    if (error || !data?.signedUrl) throw new ApiError("This video could not be opened. Please try again.", 503);
    return new Response(null, { status: 302, headers: { Location: data.signedUrl, "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error); }
}
