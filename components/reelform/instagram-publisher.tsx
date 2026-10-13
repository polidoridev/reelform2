"use client";

import Instagram from "./instagram-icon";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Check,
  LoaderCircle,
  RefreshCw,
  Unplug,
} from "lucide-react";
import "./instagram.css";

type Post = {
  id: string;
  jobId: string;
  username: string;
  caption: string;
  shareToFeed: boolean;
  status: string;
  permalink: string | null;
  error: string | null;
  createdAt: string;
  scheduledAt: string | null;
};
type Data = {
  ready: boolean;
  eligible: boolean;
  connection: {
    id: string;
    username: string;
    reconnectRequired: boolean;
  } | null;
  posts: Post[];
  selectedPost?: Post | null;
  video: { id: string; url: string } | null;
};
const labels: Record<string, string> = {
  queued: "Queued",
  cancelled: "Cancelled",
  creating: "Sending video",
  processing: "Instagram is processing your video",
  publishing: "Publishing",
  published: "Published",
  failed: "Not published",
  unknown: "Check your Instagram profile",
};
const pending = (post: Post) =>
  !["published", "failed", "cancelled"].includes(post.status);
class RequestError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
async function request<T>(
  url: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(url, {
    method,
    cache: "no-store",
    signal,
    ...(body !== undefined
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok)
    throw new RequestError(data.error || "Please try again.", response.status);
  return data;
}
function PostStatus({
  post,
  onCancel,
  busy,
}: {
  post: Post;
  onCancel: (id: string) => void;
  busy: boolean;
}) {
  return (
    <div className={`instagram-post instagram-post-${post.status}`}>
      <div className="instagram-post-heading">
        <strong>
          {post.status === "queued" && post.scheduledAt
            ? "Scheduled"
            : labels[post.status] || post.status}
        </strong>
        <span>@{post.username}</span>
      </div>
      {post.scheduledAt && (
        <p className="instagram-help">
          Scheduled for{" "}
          {new Date(post.scheduledAt).toLocaleString([], {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </p>
      )}
      {post.status === "queued" && (
        <button
          type="button"
          className="account-secondary"
          disabled={busy}
          onClick={() => onCancel(post.id)}
        >
          Cancel post
        </button>
      )}
      {post.caption && <p className="instagram-caption">{post.caption}</p>}
      {post.error && <p>{post.error}</p>}
      {post.status === "published" &&
        (post.permalink ? (
          <a href={post.permalink} target="_blank" rel="noreferrer">
            View Reel on Instagram <ArrowUpRight size={15} />
          </a>
        ) : (
          <a
            href={`https://www.instagram.com/${encodeURIComponent(post.username)}/`}
            target="_blank"
            rel="noreferrer"
          >
            View Instagram profile <ArrowUpRight size={15} />
          </a>
        ))}
      {post.status === "unknown" && (
        <a
          href={`https://www.instagram.com/${encodeURIComponent(post.username)}/`}
          target="_blank"
          rel="noreferrer"
        >
          Check Instagram <ArrowUpRight size={15} />
        </a>
      )}
    </div>
  );
}
export default function InstagramPublisher({
  generation,
  outcome,
}: {
  generation?: string;
  outcome?: string;
}) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [needsLogin, setNeedsLogin] = useState(false);
  const [busy, setBusy] = useState("");
  const [caption, setCaption] = useState("");
  const [shareToFeed, setShareToFeed] = useState(true);
  const [timing, setTiming] = useState("now");
  const [scheduledAt, setScheduledAt] = useState("");
  const [consent, setConsent] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const endpoint = `/api/instagram${generation ? `?generation=${encodeURIComponent(generation)}` : ""}`;
  const returnPath = `/instagram${generation ? `?generation=${encodeURIComponent(generation)}` : ""}`;
  function report(error: unknown) {
    setError(error instanceof Error ? error.message : "Please try again.");
    if (error instanceof RequestError && error.status === 401)
      setNeedsLogin(true);
  }
  useEffect(() => {
    const controller = new AbortController();
    request<Data>(endpoint, "GET", undefined, controller.signal)
      .then(setData)
      .catch((error) => {
        if (!controller.signal.aborted) report(error);
      });
    return () => controller.abort();
  }, [endpoint]);
  const pendingIds = [
    ...new Set(
      [
        ...(data?.posts || []),
        ...(data?.selectedPost ? [data.selectedPost] : []),
      ]
        .filter(pending)
        .map((post) => post.id),
    ),
  ]
    .slice(0, 5)
    .join(",");
  const canPoll = Boolean(
    data?.eligible &&
    data.ready &&
    data.connection &&
    !data.connection.reconnectRequired,
  );
  useEffect(() => {
    if (!pendingIds || !canPoll) return;
    let stopped = false;
    const timer = setInterval(async () => {
      try {
        // Each server operation claims its own durable revision before advancing.
        for (const id of pendingIds.split(",")) {
          if (stopped) return;
          await request(`/api/instagram/posts/${id}`, "POST");
        }
        const result = await request<Data>(endpoint);
        if (!stopped) setData(result);
      } catch (error) {
        if (!stopped) report(error);
      }
    }, 60000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [pendingIds, endpoint, canPoll]);
  async function action(name: string, run: () => Promise<void>) {
    if (busy) return;
    setBusy(name);
    setError("");
    try {
      await run();
    } catch (error) {
      report(error);
    } finally {
      setBusy("");
    }
  }
  async function refresh() {
    setData(await request<Data>(endpoint));
  }
  function cancel(id: string) {
    void action("cancel", async () => {
      const result = await request<{ post: Post }>(
        `/api/instagram/posts/${id}`,
        "DELETE",
      );
      setConsent(false);
      if (result.post.jobId === generation) {
        setCaption(result.post.caption);
        setShareToFeed(result.post.shareToFeed);
      }
      await refresh();
    });
  }
  const connection = data?.connection;
  const selected =
    data?.selectedPost?.status === "cancelled" ? null : data?.selectedPost;
  return (
    <div className="instagram-panel">
      {outcome === "connected" && (
        <p className="instagram-notice" role="status">
          <Check size={18} />
          Instagram connected. Review your video before publishing.
        </p>
      )}
      {outcome === "cancelled" && (
        <p className="instagram-notice" role="status">
          Connection cancelled. Nothing was published.
        </p>
      )}
      {outcome === "failed" && (
        <p className="instagram-error" role="alert">
          Instagram could not connect. Use a Creator or Business account, allow
          profile and publishing access, and try again. Finish any pending posts
          before switching accounts.
        </p>
      )}
      {error && (
        <div className="instagram-error" role="alert">
          <p>{error}</p>
          {needsLogin ? (
            <Link href={`/login?next=${encodeURIComponent(returnPath)}`}>
              Sign in to continue
            </Link>
          ) : (
            <button
              type="button"
              disabled={!!busy}
              onClick={() => void action("refresh", refresh)}
            >
              Try loading again
            </button>
          )}
        </div>
      )}
      {!data && !error && (
        <p role="status">
          <LoaderCircle size={18} className="instagram-spin" />
          Loading Instagram…
        </p>
      )}
      {data && (
        <>
          {!data.eligible && (
            <section className="instagram-card" aria-label="Upgrade to Pro">
              <span className="instagram-eyebrow">INCLUDED WITH PRO</span>
              <h2>Create it. Schedule it. Share it.</h2>
              <p>
                Connect Instagram, write a caption, and schedule your Reels
                to publish automatically with Pro or Studio.
              </p>
              <Link href="/pricing" className="account-primary">
                Upgrade to Pro <ArrowUpRight size={16} />
              </Link>
            </section>
          )}
          <section className="instagram-card" aria-label="Instagram connection">
            <div className="instagram-connection-heading">
              <span className="instagram-icon">
                <Instagram size={24} />
              </span>
              <div>
                <h2>
                  {connection
                    ? `@${connection.username}`
                    : "Connect your Instagram"}
                </h2>
                <p>
                  {connection
                    ? connection.reconnectRequired
                      ? "Your connection needs to be renewed."
                      : "Ready to publish Reels from Reelform."
                    : "Use a Creator or Business account. Personal accounts aren’t supported."}
                </p>
              </div>
            </div>
            {data.eligible && (!connection || connection.reconnectRequired) && (
              <div className="instagram-connect-guide">
                <h3>How to connect Instagram</h3>
                <ol className="instagram-connect-steps">
                  <li>
                    <strong>Use a Creator or Business account</strong>
                    <p>
                      You’ll need a professional Instagram account. You don’t
                      need to link a Facebook Page.
                    </p>
                  </li>
                  <li>
                    <strong>Sign in to Instagram</strong>
                    <p>
                      Select{" "}
                      {connection ? "Reconnect Instagram" : "Connect Instagram"}{" "}
                      below, then sign in to the account you want to publish
                      from.
                    </p>
                  </li>
                  <li>
                    <strong>Allow profile access and publishing</strong>
                    <p>
                      Approve both permissions on Instagram’s permission screen
                      so Reelform can connect your profile and publish your
                      Reels.
                    </p>
                  </li>
                  <li>
                    <strong>Check your connected account</strong>
                    <p>
                      You’ll return here and see your Instagram username. Choose
                      a finished video from My creations, review your Reel and
                      caption, then confirm when you’re ready to publish.
                    </p>
                  </li>
                </ol>
                <details className="instagram-connect-help">
                  <summary>Have a personal Instagram account?</summary>
                  <p>
                    In the Instagram app, open your profile and tap the menu.
                    Find <strong>Account type and tools</strong>, then choose{" "}
                    <strong>Switch to professional account</strong>. Follow the
                    prompts to select Creator or Business, then return here to
                    connect. Professional profiles are public.
                  </p>
                  <a
                    href="https://help.instagram.com/502981923235522"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Instagram’s account setup guide <ArrowUpRight size={14} />
                  </a>
                </details>
                <p className="instagram-help">
                  Having trouble? Check that you’re signing in to a Creator or
                  Business account and allow both permissions when you try
                  again. Connecting alone won’t publish anything.
                </p>
              </div>
            )}
            {!data.ready ? (
              <p className="instagram-notice">
                Instagram publishing is being set up. You can still download
                videos from My creations.
              </p>
            ) : (
              <div className="instagram-actions">
                {data.eligible &&
                  (!connection || connection.reconnectRequired) && (
                    <button
                      type="button"
                      className="account-primary"
                      disabled={!!busy}
                      onClick={() =>
                        void action("connect", async () => {
                          const result = await request<{ url: string }>(
                            "/api/instagram/connect",
                            "POST",
                            { generation },
                          );
                          window.location.assign(result.url);
                        })
                      }
                    >
                      {busy === "connect"
                        ? "Connecting…"
                        : connection
                          ? "Reconnect Instagram"
                          : "Connect Instagram"}
                      <ArrowUpRight size={16} />
                    </button>
                  )}
                {connection && (
                  <button
                    type="button"
                    className="account-secondary"
                    disabled={!!busy}
                    onClick={() => setConfirmDisconnect(!confirmDisconnect)}
                  >
                    <Unplug size={16} />
                    Disconnect
                  </button>
                )}
              </div>
            )}
            {confirmDisconnect && (
              <div className="instagram-disconnect">
                <p>
                  Disconnect Instagram and cancel videos that haven’t been
                  submitted. Published Reels stay on Instagram; a publish
                  request already sent may still finish.
                </p>
                <button
                  type="button"
                  className="account-secondary"
                  disabled={!!busy}
                  onClick={() =>
                    void action("disconnect", async () => {
                      await request("/api/instagram", "DELETE");
                      setConfirmDisconnect(false);
                      setConsent(false);
                      await refresh();
                    })
                  }
                >
                  Confirm disconnect
                </button>
              </div>
            )}
          </section>
          {data.eligible && data.video && (
            <section
              className="instagram-card instagram-compose"
              aria-label="Review your Reel"
            >
              <div>
                <h2>Review your Reel</h2>
                <video
                  src={data.video.url}
                  controls
                  playsInline
                  preload="metadata"
                  aria-label="Reel preview"
                />
                <p className="instagram-help">
                  Your saved Reelform video will be published as a Reel.
                  Vertical 9:16 video works best.
                </p>
              </div>
              <div>
                {selected ? (
                  <>
                    <PostStatus
                      post={selected}
                      onCancel={cancel}
                      busy={!!busy}
                    />
                    {["failed", "cancelled"].includes(selected.status) &&
                      connection &&
                      !connection.reconnectRequired && (
                        <button
                          type="button"
                          className="account-primary"
                          disabled={!!busy}
                          onClick={() =>
                            void action("retry", async () => {
                              await request("/api/instagram/posts", "POST", {
                                generation: selected.jobId,
                                instagramAccountId: connection.id,
                                caption: selected.caption,
                                shareToFeed: selected.shareToFeed,
                                consent: true,
                                retry: true,
                              });
                              await refresh();
                            })
                          }
                        >
                          {busy === "retry"
                            ? "Retrying…"
                            : "Retry publishing this Reel"}
                        </button>
                      )}
                  </>
                ) : (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      void action("publish", async () => {
                        if (
                          timing === "later" &&
                          (!scheduledAt ||
                            !Number.isFinite(Date.parse(scheduledAt)) ||
                            Date.parse(scheduledAt) < Date.now() + 60000)
                        )
                          throw new Error(
                            "Choose a time at least one minute from now.",
                          );
                        const result = await request<{ post: Post }>(
                          "/api/instagram/posts",
                          "POST",
                          {
                            generation: data.video!.id,
                            instagramAccountId: connection!.id,
                            caption,
                            shareToFeed,
                            consent,
                            retry: data.selectedPost?.status === "cancelled",
                            scheduledAt:
                              timing === "later"
                                ? new Date(scheduledAt).toISOString()
                                : null,
                          },
                        );
                        setData((previous) =>
                          previous
                            ? {
                                ...previous,
                                selectedPost: result.post,
                                posts: [
                                  result.post,
                                  ...previous.posts.filter(
                                    (p) => p.id !== result.post.id,
                                  ),
                                ],
                              }
                            : previous,
                        );
                      });
                    }}
                  >
                    <label
                      className="instagram-label"
                      htmlFor="instagram-caption"
                    >
                      Caption
                    </label>
                    <textarea
                      id="instagram-caption"
                      value={caption}
                      onChange={(event) => {
                        setCaption(event.target.value);
                        setConsent(false);
                      }}
                      maxLength={2200}
                      rows={6}
                      placeholder="Tell the story behind your Reel…"
                      disabled={!!busy}
                    />
                    <span className="instagram-count">
                      {caption.length.toLocaleString()} / 2,200
                    </span>
                    <label
                      className="instagram-label"
                      htmlFor="instagram-timing"
                    >
                      When to post
                    </label>
                    <select
                      id="instagram-timing"
                      value={timing}
                      disabled={!!busy}
                      onChange={(event) => {
                        setTiming(event.target.value);
                        setConsent(false);
                      }}
                    >
                      <option value="now">Publish now</option>
                      <option value="later">Schedule for later</option>
                    </select>
                    {timing === "later" && (
                      <>
                        <label
                          className="instagram-label"
                          htmlFor="instagram-schedule"
                        >
                          Date and time
                        </label>
                        <input
                          id="instagram-schedule"
                          type="datetime-local"
                          required
                          value={scheduledAt}
                          disabled={!!busy}
                          onChange={(event) => {
                            setScheduledAt(event.target.value);
                            setConsent(false);
                          }}
                        />
                        <p className="instagram-help">
                          Your time zone:{" "}
                          {Intl.DateTimeFormat().resolvedOptions().timeZone}.
                          Choose a time within 90 days. Your Reel will post
                          automatically, even when you close Reelform. Instagram
                          processing can take a few minutes.
                        </p>
                      </>
                    )}
                    <label className="instagram-checkbox">
                      <input
                        type="checkbox"
                        checked={shareToFeed}
                        disabled={!!busy}
                        onChange={(event) => {
                          setShareToFeed(event.target.checked);
                          setConsent(false);
                        }}
                      />
                      <span>Also share to my Instagram feed</span>
                    </label>
                    <label className="instagram-checkbox">
                      <input
                        type="checkbox"
                        checked={consent}
                        required
                        disabled={!!busy}
                        onChange={(event) => setConsent(event.target.checked)}
                      />
                      <span>
                        I’ve reviewed this video and caption and want to{" "}
                        {timing === "later"
                          ? "schedule it for automatic posting"
                          : "publish"}{" "}
                        to{" "}
                        {connection ? `@${connection.username}` : "Instagram"}.
                      </span>
                    </label>
                    <button
                      className="account-primary"
                      disabled={
                        !!busy ||
                        !data.ready ||
                        !connection ||
                        connection.reconnectRequired ||
                        !consent ||
                        (timing === "later" && !scheduledAt)
                      }
                    >
                      <Instagram size={17} />
                      {busy === "publish"
                        ? timing === "later"
                          ? "Saving schedule…"
                          : "Sending to Instagram…"
                        : timing === "later"
                          ? "Schedule Reel"
                          : "Publish Reel"}
                    </button>
                    <p className="instagram-help">
                      Keep Pro or Studio active until your Reel posts. You can
                      follow its status here and cancel it before processing
                      starts.
                    </p>
                  </form>
                )}
              </div>
            </section>
          )}
          {!data.video && (
            <p className="instagram-help">
              Choose a finished video in{" "}
              <Link href="/account?tab=creations">My creations</Link> or the
              studio to publish it.
            </p>
          )}
          {(data.posts.length > 0 || selected) && (
            <section
              className="instagram-card"
              aria-label="Instagram publishing history"
            >
              <div className="instagram-history-heading">
                <h2>Recent publishing</h2>
                <button
                  type="button"
                  className="account-secondary"
                  disabled={!!busy || !data.eligible}
                  onClick={() =>
                    void action("check", async () => {
                      for (const id of pendingIds.split(",").filter(Boolean))
                        await request(`/api/instagram/posts/${id}`, "POST");
                      await refresh();
                    })
                  }
                >
                  <RefreshCw size={15} />
                  {busy === "check" ? "Checking…" : "Check status"}
                </button>
              </div>
              {data.posts.map((post) => (
                <PostStatus
                  key={post.id}
                  post={post}
                  onCancel={cancel}
                  busy={!!busy}
                />
              ))}
            </section>
          )}
          <p className="instagram-help">
            Reelform publishes only the Reels you approve, now or at your
            scheduled time. Disconnect at any time.{" "}
            <Link href="/privacy#instagram">How Instagram data is used</Link>
          </p>
        </>
      )}
    </div>
  );
}
