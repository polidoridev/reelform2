import { admin, checked } from "@/lib/supabase/server";
import { ApiError } from "@/lib/http";
import { libraryUrl, VIDEO_BUCKET } from "@/lib/commerce/video-library";
import { decryptToken, encryptToken, instagramConfigured } from "./security";
import { graph, InstagramError, refreshToken, safePermalink } from "./api";
import { advancePost, type InstagramPost, type PostPatch } from "./publishing";
import { instagramAccess, requireInstagramAccess } from "./access";
import { scheduledTime } from "./scheduling";

export type InstagramConnection = {
  user_id: string;
  instagram_user_id: string;
  app_scoped_id: string;
  username: string;
  token_ciphertext: string;
  expires_at: string;
  refreshed_at: string;
  reconnect_required: boolean;
};
export async function connectionFor(user: string) {
  const { data } = await checked(
    admin()
      .from("rf_instagram_connections")
      .select("*")
      .eq("user_id", user)
      .maybeSingle(),
  );
  return data as InstagramConnection | null;
}
export async function tokenFor(user: string, instagramId?: string) {
  const connection = await connectionFor(user);
  if (
    !connection ||
    (instagramId && connection.instagram_user_id !== instagramId) ||
    connection.reconnect_required ||
    Date.parse(connection.expires_at) <= Date.now()
  )
    throw new ApiError("Reconnect Instagram to continue.", 409);
  let token = decryptToken(connection.token_ciphertext, user);
  if (
    Date.parse(connection.expires_at) - Date.now() < 7 * 86400000 &&
    Date.now() - Date.parse(connection.refreshed_at) > 86400000
  ) {
    try {
      const refreshed = await refreshToken(token);
      const { data } = await checked(
        admin()
          .from("rf_instagram_connections")
          .update({
            token_ciphertext: encryptToken(refreshed.access_token, user),
            expires_at: new Date(
              Date.now() + refreshed.expires_in * 1000,
            ).toISOString(),
            refreshed_at: new Date().toISOString(),
          })
          .eq("user_id", user)
          .eq("token_ciphertext", connection.token_ciphertext)
          .select("user_id")
          .maybeSingle(),
      );
      if (!data)
        throw new ApiError(
          "Your Instagram connection changed. Please try again.",
          409,
        );
      token = refreshed.access_token;
    } catch (error) {
      if (error instanceof InstagramError && error.code === 190)
        await markReconnect(user, connection.instagram_user_id);
      throw error;
    }
  }
  return token;
}
async function markReconnect(user: string, instagramId: string) {
  await checked(
    admin()
      .from("rf_instagram_connections")
      .update({ reconnect_required: true })
      .eq("user_id", user)
      .eq("instagram_user_id", instagramId),
  );
}
export async function ownedVideo(user: string, id: string) {
  const { data } = await checked(
    admin()
      .from("rf_jobs")
      .select("id,status,result_url")
      .eq("id", id)
      .eq("user_id", user)
      .maybeSingle(),
  );
  if (!data) throw new ApiError("Video not found.", 404);
  if (data.status !== "completed" || data.result_url !== libraryUrl(id))
    throw new ApiError(
      "Wait until this finished video is saved to your account before publishing.",
      409,
    );
  return { id: data.id as string, url: data.result_url as string };
}
export function publicPost(post: InstagramPost) {
  return {
    id: post.id,
    jobId: post.job_id,
    username: post.username,
    caption: post.caption,
    shareToFeed: post.share_to_feed,
    status: post.status,
    permalink: post.permalink,
    error: post.error,
    createdAt: post.created_at,
    scheduledAt: post.scheduled_at ? new Date(post.scheduled_at).toISOString() : null,
  };
}
export async function getPost(user: string, id: string) {
  const { data } = await checked(
    admin()
      .from("rf_instagram_posts")
      .select("*")
      .eq("id", id)
      .eq("user_id", user)
      .maybeSingle(),
  );
  if (!data) throw new ApiError("Instagram post not found.", 404);
  return data as InstagramPost;
}
async function change(expected: InstagramPost, patch: PostPatch) {
  const { data } = await checked(
    admin()
      .from("rf_instagram_posts")
      .update({
        ...patch,
        revision: expected.revision + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", expected.id)
      .eq("user_id", expected.user_id)
      .eq("revision", expected.revision)
      .select("*")
      .maybeSingle(),
  );
  return data as InstagramPost | null;
}
export async function processPost(post: InstagramPost) {
  async function call<T>(
    path: string,
    token: string,
    params: Record<string, string>,
    method = "GET",
  ) {
    try {
      return await graph<T>(path, token, params, method);
    } catch (error) {
      if (error instanceof InstagramError && error.code === 190)
        await markReconnect(post.user_id, post.instagram_user_id);
      throw error;
    }
  }
  return advancePost(post, {
    eligible: (p) => instagramAccess(p.user_id),
    change,
    token: (p) => tokenFor(p.user_id, p.instagram_user_id),
    video: async (p) => {
      await ownedVideo(p.user_id, p.job_id);
      const { data } = await checked(
        admin()
          .storage.from(VIDEO_BUCKET)
          .createSignedUrl(`${p.user_id}/${p.job_id}.mp4`, 3600),
      );
      if (!data?.signedUrl)
        throw new ApiError("The video could not be prepared.", 503);
      return data.signedUrl;
    },
    create: async (p, token, video) => {
      const r = await call<{ id: string }>(
        `${p.instagram_user_id}/media`,
        token,
        {
          media_type: "REELS",
          video_url: video,
          caption: p.caption,
          share_to_feed: String(p.share_to_feed),
        },
        "POST",
      );
      if (!r.id) throw new Error("Missing Instagram container");
      return String(r.id);
    },
    status: async (id, token) =>
      (
        await call<{ status_code: string }>(id, token, {
          fields: "status_code",
        })
      ).status_code,
    publish: async (p, token) => {
      await requireInstagramAccess(p.user_id);
      // A disconnected/switched account must not be used to start a new publish.
      const connection = await connectionFor(p.user_id);
      if (
        !connection ||
        connection.instagram_user_id !== p.instagram_user_id ||
        connection.reconnect_required
      )
        throw new Error("Disconnected");
      const result = await call<{ id: string }>(
        `${p.instagram_user_id}/media_publish`,
        token,
        { creation_id: p.container_id! },
        "POST",
      );
      if (!result.id) throw new Error("Missing published media id");
      return String(result.id);
    },
    permalink: async (id, token) =>
      safePermalink(
        (await call<{ permalink?: string }>(id, token, { fields: "permalink" }))
          .permalink,
      ),
  });
}
export async function reservePost(
  user: string,
  job: string,
  caption: string,
  shareToFeed: boolean,
  retry = false,
  expectedInstagramId?: string,
  scheduledAt?: string | null,
) {
  await requireInstagramAccess(user);
  const schedule = scheduledTime(scheduledAt);
  await ownedVideo(user, job);
  const connection = await connectionFor(user);
  if (
    !connection ||
    connection.reconnect_required ||
    Date.parse(connection.expires_at) <= Date.now()
  )
    throw new ApiError("Connect Instagram before publishing.", 409);
  if (
    expectedInstagramId &&
    connection.instagram_user_id !== expectedInstagramId
  )
    throw new ApiError(
      "Your Instagram account changed. Reload and review the destination before publishing.",
      409,
    );
  // The database unique constraint protects against clicks, retries, and separate tabs.
  const { data, error } = await admin()
    .from("rf_instagram_posts")
    .insert({
      user_id: user,
      job_id: job,
      instagram_user_id: connection.instagram_user_id,
      username: connection.username,
      caption,
      share_to_feed: shareToFeed,
      scheduled_at: schedule,
    })
    .select("*")
    .single();
  if (error?.code === "23505") {
    const result = await checked(
      admin()
        .from("rf_instagram_posts")
        .select("*")
        .eq("user_id", user)
        .eq("job_id", job)
        .eq("instagram_user_id", connection.instagram_user_id)
        .single(),
    );
    const existing = result.data as InstagramPost;
    if (retry && ["failed", "cancelled"].includes(existing.status)) {
      const { data: retried } = await checked(
        admin()
          .from("rf_instagram_posts")
          .update({
            status: "queued",
            caption,
            share_to_feed: shareToFeed,
            scheduled_at: schedule,
            container_id: null,
            media_id: null,
            permalink: null,
            error: null,
            revision: existing.revision + 1,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id)
          .eq("user_id", user)
          .eq("revision", existing.revision)
          .eq("status", existing.status)
          .select("*")
          .maybeSingle(),
      );
      return (retried as InstagramPost) || existing;
    }
    return existing;
  }
  if (error)
    throw new ApiError("Your publishing request could not be saved.", 503);
  return data as InstagramPost;
}
export async function disconnectInstagram(user: string) {
  // Remove the credential first; work not yet submitted will fail closed.
  await checked(
    admin().from("rf_instagram_connections").delete().eq("user_id", user),
  );
  await checked(
    admin().from("rf_instagram_oauth_states").delete().eq("user_id", user),
  );
  const { data } = await checked(
    admin()
      .from("rf_instagram_posts")
      .select("*")
      .eq("user_id", user)
      .in("status", ["queued", "creating", "processing"]),
  );
  for (const row of data || [])
    await change(row, {
      status: "failed",
      error: "Publishing was cancelled when Instagram was disconnected.",
    });
}
export async function cancelPost(user: string, id: string) {
  const post = await getPost(user, id);
  if (post.status === "cancelled") return post;
  if (post.status !== "queued")
    throw new ApiError(
      "This Reel has already started processing and cannot be cancelled.",
      409,
    );
  const cancelled = await change(post, { status: "cancelled", error: null });
  if (!cancelled)
    throw new ApiError("This Reel changed. Reload to check its status.", 409);
  return cancelled;
}
export async function maintainInstagram() {
  if (!instagramConfigured()) return;
  const db = admin();
  await checked(
    db
      .from("rf_instagram_oauth_states")
      .delete()
      .lt("expires_at", new Date().toISOString()),
  );
  const { data: posts } = await checked(
    db
      .from("rf_instagram_posts")
      .select("*")
      .not("status", "in", '("published","failed","cancelled")')
      .or(`scheduled_at.is.null,scheduled_at.lte.${new Date().toISOString()}`)
      .lt("updated_at", new Date(Date.now() - 60000).toISOString())
      .order("updated_at")
      .limit(20),
  );
  // One broken connection must not starve other users. Process bounded parallel batches.
  let errors = 0;
  for (let index = 0; index < (posts || []).length; index += 5) {
    const results = await Promise.allSettled(
      posts!.slice(index, index + 5).map(processPost),
    );
    errors += results.filter((result) => result.status === "rejected").length;
  }
  const { data: connections } = await checked(
    db
      .from("rf_instagram_connections")
      .select("user_id")
      .eq("reconnect_required", false)
      .lt("expires_at", new Date(Date.now() + 7 * 86400000).toISOString())
      .gt("expires_at", new Date().toISOString())
      .order("expires_at")
      .limit(2),
  );
  for (const connection of connections || [])
    try {
      await tokenFor(connection.user_id);
    } catch {
      errors++;
    }
  if (errors)
    throw new ApiError(
      "Some Instagram operations could not be completed.",
      503,
    );
}
