// Kept independent of the database/HTTP runtime so races and ambiguous outcomes can be tested.
export type PublishStatus =
  | "queued"
  | "creating"
  | "processing"
  | "publishing"
  | "published"
  | "failed"
  | "cancelled"
  | "unknown";
export type InstagramPost = {
  id: string;
  user_id: string;
  job_id: string;
  instagram_user_id: string;
  username: string;
  caption: string;
  share_to_feed: boolean;
  status: PublishStatus;
  container_id: string | null;
  media_id: string | null;
  permalink: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
  revision: number;
  scheduled_at: string | null;
};
export type PostPatch = Partial<
  Pick<
    InstagramPost,
    "status" | "container_id" | "media_id" | "permalink" | "error"
  >
>;
export interface PublishDependencies {
  eligible: (post: InstagramPost) => Promise<boolean>;
  change: (
    expected: InstagramPost,
    patch: PostPatch,
  ) => Promise<InstagramPost | null>;
  token: (post: InstagramPost) => Promise<string>;
  video: (post: InstagramPost) => Promise<string>;
  create: (
    post: InstagramPost,
    token: string,
    video: string,
  ) => Promise<string>;
  status: (container: string, token: string) => Promise<string>;
  publish: (post: InstagramPost, token: string) => Promise<string>;
  permalink: (media: string, token: string) => Promise<string | null>;
}
export const pendingPost = (status: PublishStatus) =>
  !["published", "failed", "cancelled"].includes(status);
const uncertain =
  "Instagram has not confirmed the result. Check your Instagram profile before taking further action. Reelform will not submit this Reel again.";
export async function advancePost(
  post: InstagramPost,
  deps: PublishDependencies,
  now = Date.now(),
) {
  if (!pendingPost(post.status)) return post;
  // Never create a Meta container early: containers and signed URLs expire.
  if (
    post.status === "queued" &&
    post.scheduled_at &&
    Date.parse(post.scheduled_at) > now
  )
    return post;
  if (
    ["queued", "processing"].includes(post.status) &&
    !(await deps.eligible(post))
  )
    return (
      (await deps.change(post, {
        status: "failed",
        error:
          "Your Pro or Studio subscription ended. Renew your plan, then retry this Reel.",
      })) ?? post
    );
  if (post.status === "creating") {
    if (now - Date.parse(post.updated_at) > 120000)
      return (
        (await deps.change(post, {
          status: "failed",
          error:
            "The video upload was interrupted before publishing. No publish request was sent.",
        })) ?? post
      );
    return post;
  }
  if (post.status === "queued") {
    const claimed = await deps.change(post, {
      status: "creating",
      error: null,
    });
    if (!claimed) return post;
    let container: string;
    try {
      const token = await deps.token(claimed);
      const video = await deps.video(claimed);
      container = await deps.create(claimed, token, video);
    } catch {
      // A container alone is never public; no publish request has been sent yet.
      return (
        (await deps.change(claimed, {
          status: "failed",
          error:
            "Instagram could not prepare this Reel. Check your connection and video format. No publish request was sent.",
        })) ?? claimed
      );
    }
    return (
      (await deps.change(claimed, {
        status: "processing",
        container_id: container,
      })) ?? claimed
    );
  }
  // Keep concurrent browser polling and maintenance within Meta's recommended cadence.
  if (now - Date.parse(post.updated_at) < 60000) return post;
  const claimed = await deps.change(post, {});
  if (!claimed || !claimed.container_id) return post;
  let token: string;
  let status: string;
  try {
    token = await deps.token(claimed);
    status = await deps.status(claimed.container_id, token);
  } catch {
    return (
      (await deps.change(claimed, {
        error:
          "Could not check Instagram. Reconnect if needed, then check again. Your Reel will not be submitted twice.",
      })) ?? claimed
    );
  }
  if (status === "PUBLISHED")
    return (
      (await deps.change(claimed, { status: "published", error: null })) ??
      claimed
    );
  if (status === "ERROR" || status === "EXPIRED") {
    // Once media_publish may have been sent, a later container error is not
    // evidence that no Reel was published. Keep explicit retries disabled.
    if (claimed.status !== "processing")
      return (
        (await deps.change(claimed, { status: "unknown", error: uncertain })) ??
        claimed
      );
    return (
      (await deps.change(claimed, {
        status: "failed",
        error:
          "Instagram could not process this video or its upload expired. Check the video format and your Instagram account.",
      })) ?? claimed
    );
  }
  if (status !== "FINISHED") return claimed;
  if (claimed.status !== "processing")
    return (
      (await deps.change(claimed, { status: "unknown", error: uncertain })) ??
      claimed
    );
  // This durable transition is the only path to media_publish. Never replay it,
  // including after a timeout, process crash, or failed database response.
  const publishing = await deps.change(claimed, {
    status: "publishing",
    error: null,
  });
  if (!publishing) return claimed;
  let media: string;
  try {
    media = await deps.publish(publishing, token);
  } catch {
    return (
      (await deps.change(publishing, {
        status: "unknown",
        error: uncertain,
      })) ?? publishing
    );
  }
  // Commit success before an optional permalink lookup can fail.
  const published = await deps.change(publishing, {
    status: "published",
    media_id: media,
    error: null,
  });
  if (!published) return publishing;
  try {
    const permalink = await deps.permalink(media, token);
    return permalink
      ? ((await deps.change(published, { permalink })) ?? published)
      : published;
  } catch {
    return published;
  }
}
