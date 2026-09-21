import { z } from "zod";
import {
  requireUser,
  admin,
  checked,
  currentUser,
  isReelformAdmin,
} from "@/lib/supabase/server";
import { ApiError, errorResponse, noStore, readJson } from "@/lib/http";
import {
  COMMUNITY_BUCKET,
  COMMUNITY_RIGHTS_VERSION,
  communityPublishSchema,
} from "@/lib/community-config";
import { COMMUNITY_COLUMNS, removeCommunityPost } from "@/lib/community";
import { inspectVideo } from "@/lib/commerce/media";

type Context = { params: Promise<{ id: string }> };
async function postId(context: Context) {
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success)
    throw new ApiError("Post not found.", 404);
  return id;
}
export async function GET(_request: Request, context: Context) {
  try {
    const id = await postId(context);
    const user = await currentUser();
    const { data } = await checked(
      admin()
        .from("rf_community_posts")
        .select(COMMUNITY_COLUMNS)
        .eq("id", id)
        .eq("status", "published")
        .maybeSingle(),
    );
    if (!data) throw new ApiError("This post is no longer available.", 404);
    const { user_id, ...post } = data;
    return noStore({
      post: {
        ...post,
        canRemove: !!user && (user.id === user_id || isReelformAdmin(user)),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request, context: Context) {
  try {
    const user = await requireUser(request);
    const id = await postId(context);
    const body = communityPublishSchema.parse(await readJson(request));
    const db = admin();
    const { data: post } = await checked(
      db
        .from("rf_community_posts")
        .select("*")
        .eq("id", id)
        .eq("user_id", user.id)
        .maybeSingle(),
    );
    if (!post || post.status === "deleted")
      throw new ApiError("Upload not found.", 404);
    if (post.status === "published") return noStore({ id }); // Safe retry after a lost response.
    if (Date.now() - Date.parse(post.created_at) > 23 * 3600_000)
      throw new ApiError(
        "This upload has expired. Please upload it again.",
        410,
      );
    const bucket = db.storage.from(COMMUNITY_BUCKET);
    const info = await bucket.info(post.storage_path);
    if (
      info.error ||
      !info.data ||
      info.data.size !== post.bytes ||
      info.data.contentType !== post.content_type
    )
      throw new ApiError(
        "The upload is incomplete or the file type does not match. Please upload it again.",
      );
    const signed = await bucket.createSignedUrl(post.storage_path, 120);
    if (signed.error || !signed.data)
      throw new ApiError("Could not verify this video.", 503);
    await inspectVideo(signed.data.signedUrl, post.bytes);
    const { data: published } = await checked(
      db
        .from("rf_community_posts")
        .update({
          title: body.title,
          creator: body.creator,
          caption: body.caption,
          ai_assisted: body.aiAssisted,
          status: "published",
          published_at: new Date().toISOString(),
          rights_accepted_at: new Date().toISOString(),
          rights_version: COMMUNITY_RIGHTS_VERSION,
        })
        .eq("id", id)
        .eq("user_id", user.id)
        .eq("status", "uploading")
        .select("id")
        .maybeSingle(),
    );
    if (!published)
      throw new ApiError("This upload is no longer available.", 409);
    return noStore({ id });
  } catch (error) {
    return errorResponse(
      error instanceof z.ZodError
        ? new ApiError(
            "Add a title, public creator name, and confirm your publishing permission.",
          )
        : error,
    );
  }
}
export async function DELETE(request: Request, context: Context) {
  try {
    const user = await requireUser(request);
    await removeCommunityPost(
      await postId(context),
      isReelformAdmin(user) ? undefined : user.id,
    );
    return noStore({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
