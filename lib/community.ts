import { admin, checked } from "@/lib/supabase/server";
import { ApiError } from "@/lib/http";
import { COMMUNITY_BUCKET } from "./community-config";

export const COMMUNITY_COLUMNS =
  "id,user_id,title,creator,caption,ai_assisted,published_at";

export async function removeCommunityPost(id: string, userId?: string) {
  const db = admin();
  let query = db
    .from("rf_community_posts")
    .update({ status: "deleted" })
    .eq("id", id);
  if (userId) query = query.eq("user_id", userId);
  const { data } = await checked(query.select("storage_path").maybeSingle());
  if (!data) throw new ApiError("Post not found.", 404);
  // Withdraw public access before removing the file. Failed removals are retried
  // by maintenance; no public bucket or permanent playback URL is exposed.
  const { error } = await db.storage
    .from(COMMUNITY_BUCKET)
    .remove([data.storage_path]);
  if (error)
    throw new ApiError(
      "Your post is hidden. File removal is pending; please retry.",
      503,
    );
}

export async function removeUserCommunity(userId: string) {
  const db = admin();
  await checked(
    db
      .from("rf_community_posts")
      .update({ status: "deleted" })
      .eq("user_id", userId),
  );
  while (true) {
    const { data, error } = await db.storage
      .from(COMMUNITY_BUCKET)
      .list(userId, { limit: 100 });
    if (error)
      throw new ApiError(
        "Community videos could not be removed. Please retry account deletion.",
        503,
      );
    if (!data.length) return;
    await checked(
      db.storage
        .from(COMMUNITY_BUCKET)
        .remove(data.map((file) => `${userId}/${file.name}`)),
    );
  }
}

export async function cleanCommunityUploads() {
  const db = admin();
  // Signed upload links expire after two hours. Retain tombstones beyond that
  // window so a late upload can never resurrect a removed post.
  const cutoff = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { data } = await checked(
    db
      .from("rf_community_posts")
      .select("id,storage_path")
      .in("status", ["uploading", "deleted"])
      .lt("created_at", cutoff)
      .limit(20),
  );
  for (const row of data || []) {
    const { data: claimed } = await checked(
      db
        .from("rf_community_posts")
        .update({ status: "deleted" })
        .eq("id", row.id)
        .in("status", ["uploading", "deleted"])
        .select("id")
        .maybeSingle(),
    );
    if (!claimed) continue; // A concurrent publish won; never remove its file.
    await checked(db.storage.from(COMMUNITY_BUCKET).remove([row.storage_path]));
    await checked(
      db
        .from("rf_community_posts")
        .delete()
        .eq("id", row.id)
        .eq("status", "deleted"),
    );
  }
  return data?.length || 0;
}
