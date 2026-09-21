import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireUser, admin } from "@/lib/supabase/server";
import { ApiError, errorResponse, noStore, readJson } from "@/lib/http";
import {
  COMMUNITY_BUCKET,
  communityUploadSchema,
} from "@/lib/community-config";

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const body = communityUploadSchema.parse(await readJson(request));
    const id = randomUUID();
    const path = `${user.id}/${id}.${body.contentType === "video/mp4" ? "mp4" : "webm"}`;
    const db = admin();
    const { error } = await db.from("rf_community_posts").insert({
      id,
      user_id: user.id,
      storage_path: path,
      bytes: body.bytes,
      content_type: body.contentType,
    });
    if (error?.message.includes("community_quota"))
      throw new ApiError(
        "You can start 10 uploads per day and keep up to 50 community videos. Remove a post or try tomorrow.",
        429,
      );
    if (error)
      throw new ApiError(
        "Community uploads are unavailable. Please try again.",
        503,
      );
    const signed = await db.storage
      .from(COMMUNITY_BUCKET)
      .createSignedUploadUrl(path, { upsert: false });
    if (signed.error || !signed.data) {
      await db
        .from("rf_community_posts")
        .update({ status: "deleted" })
        .eq("id", id);
      throw new ApiError("Could not start your upload. Please try again.", 503);
    }
    return noStore({ id, uploadUrl: signed.data.signedUrl }, 201);
  } catch (error) {
    return errorResponse(
      error instanceof z.ZodError
        ? new ApiError("Choose an MP4 or WebM video up to 50 MB.")
        : error,
    );
  }
}
