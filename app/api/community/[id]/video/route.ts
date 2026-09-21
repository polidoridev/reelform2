import { z } from "zod";
import { admin, checked } from "@/lib/supabase/server";
import { ApiError, errorResponse } from "@/lib/http";
import { COMMUNITY_BUCKET } from "@/lib/community-config";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success)
      throw new ApiError("Video not found.", 404);
    const db = admin();
    const { data: post } = await checked(
      db
        .from("rf_community_posts")
        .select("storage_path")
        .eq("id", id)
        .eq("status", "published")
        .maybeSingle(),
    );
    if (!post) throw new ApiError("Video not found.", 404);
    const { data, error } = await db.storage
      .from(COMMUNITY_BUCKET)
      .createSignedUrl(post.storage_path, 300);
    if (error || !data)
      throw new ApiError("This video is temporarily unavailable.", 503);
    return new Response(null, {
      status: 302,
      headers: {
        Location: data.signedUrl,
        "Cache-Control": "private, no-store",
        "X-Robots-Tag": "noindex",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
