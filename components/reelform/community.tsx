"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowUpRight,
  ArrowLeft,
  Film,
  Upload,
  ShieldCheck,
  Trash2,
  Link as LinkIcon,
  Flag,
  Check,
} from "lucide-react";
import Brand from "./brand";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  COMMUNITY_MAX_BYTES,
  type CommunityPost,
} from "@/lib/community-config";
import "./community.css";

async function api<T = { ok: boolean }>(
  url: string,
  method = "GET",
  body?: unknown,
) {
  const response = await fetch(url, {
    method,
    cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok)
    throw new Error(data.error || "Something went wrong. Please try again.");
  return data;
}

function CommunityShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="community-page">
      <a className="skip-link" href="#community-main">
        Skip to content
      </a>
      <header className="community-header">
        <Brand />
        <nav aria-label="Main navigation">
          <Link prefetch={false} href="/community" aria-current="page">
            Community
          </Link>
          <Link prefetch={false} href="/account">
            My account
          </Link>
          <Link prefetch={false} className="community-button" href="/studio">
            Open studio <ArrowUpRight size={15} />
          </Link>
        </nav>
      </header>
      <main id="community-main">{children}</main>
      <footer className="community-footer">
        <span>Made by you. Always yours.</span>
        <div>
          <Link prefetch={false} href="/terms">
            Terms & creator rights
          </Link>
          <Link prefetch={false} href="/privacy">
            Privacy
          </Link>
          <Link prefetch={false} href="/">
            Reelform home
          </Link>
        </div>
      </footer>
    </div>
  );
}

function PostCard({
  post,
  onRemove,
  standalone = false,
}: {
  post: CommunityPost;
  onRemove: (id: string) => void;
  standalone?: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  async function remove() {
    setBusy(true);
    setError("");
    try {
      await api(`/api/community/${post.id}`, "DELETE");
      onRemove(post.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(
        `${location.origin}/community/${post.id}`,
      );
      setCopied(true);
    } catch {
      setError(
        "Could not copy the link. Open the video title and copy its address.",
      );
    }
  }
  return (
    <article className={`community-post${standalone ? " is-standalone" : ""}`}>
      <div className="community-player">
        <video
          src={`/api/community/${post.id}/video`}
          controls
          playsInline
          preload="metadata"
          aria-label={post.title}
          onError={() =>
            setError(
              "This video could not load. Refresh the page to try again.",
            )
          }
        />
        {post.ai_assisted && <span className="community-ai">AI-assisted</span>}
      </div>
      <div className="community-post-info">
        <div className="community-byline">
          <span className="community-avatar" aria-hidden="true">
            {post.creator.slice(0, 1).toUpperCase()}
          </span>
          <span>
            {post.creator}
            <small>Creator</small>
          </span>
        </div>
        <h2>
          {standalone ? (
            post.title
          ) : (
            <Link prefetch={false} href={`/community/${post.id}`}>
              {post.title}
            </Link>
          )}
        </h2>
        {post.caption && <p className="community-caption">{post.caption}</p>}
        <div className="community-post-actions">
          <button onClick={copy} aria-label={`Copy link to ${post.title}`}>
            {copied ? <Check size={15} /> : <LinkIcon size={15} />}
            {copied ? "Copied" : "Share link"}
          </button>
          <a
            href={`mailto:admin@polidori.dev?subject=${encodeURIComponent(`Report community post ${post.id}`)}&body=${encodeURIComponent(`Post: /community/${post.id}\n\nReason for report:\n`)}`}
            aria-label={`Report ${post.title}`}
          >
            <Flag size={15} />
            Report
          </a>
          {post.canRemove && (
            <button
              onClick={() => setConfirming(!confirming)}
              aria-expanded={confirming}
            >
              <Trash2 size={15} />
              Remove
            </button>
          )}
        </div>
        {confirming && (
          <div className="community-remove">
            <p>
              Remove this video from the community? Keep a copy of your
              original; this cannot be undone.
            </p>
            <button
              className="community-button"
              onClick={remove}
              disabled={busy}
            >
              {busy ? "Removing…" : "Remove video"}
            </button>
            <button onClick={() => setConfirming(false)} disabled={busy}>
              Keep video
            </button>
          </div>
        )}
        {error && (
          <p role="alert" className="community-error">
            {error}
          </p>
        )}
      </div>
    </article>
  );
}

export function CommunityGallery({ postId }: { postId?: string }) {
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [mine, setMine] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [reload, setReload] = useState(0);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const data = await api<{
          post: CommunityPost;
          posts: CommunityPost[];
          hasMore: boolean;
          signedIn: boolean;
        }>(
          postId
            ? `/api/community/${postId}`
            : `/api/community?mine=${mine}&page=${page}`,
        );
        if (!active) return;
        setPosts(postId ? [data.post] : data.posts);
        setHasMore(!!data.hasMore);
        setSignedIn(!!data.signedIn);
      } catch (e) {
        if (active) {
          setPosts([]);
          setError((e as Error).message);
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [mine, page, postId, reload]);
  function removed(id: string) {
    setPosts((p) => p.filter((post) => post.id !== id));
    setNotice(
      "Video removed from the community. Your original creation and ownership are unchanged.",
    );
  }
  return (
    <CommunityShell>
      {postId ? (
        <div className="community-single-heading">
          <Link prefetch={false} href="/community">
            <ArrowLeft size={16} /> Back to community
          </Link>
          <p>Shared by its creator. All rights retained.</p>
        </div>
      ) : (
        <>
          <section className="community-intro">
            <div>
              <span className="community-eyebrow">THE REELFORM COMMUNITY</span>
              <h1>
                A little imagination.
                <br />
                <span>A world of possibility.</span>
              </h1>
              <p>
                See what happens when creators make reality their own.
                <br className="community-desktop-break" /> Find your next idea.
                Share what you made.
              </p>
              <Link
                prefetch={false}
                className="community-button"
                href="/community/share"
              >
                Share your video <Upload size={17} />
              </Link>
            </div>
            <aside className="community-ownership">
              <ShieldCheck size={28} />
              <h2>
                Your work.
                <br /> Your rights.
              </h2>
              <p>
                You keep ownership of your videos. You choose what to share, and
                you can remove your posts anytime.
              </p>
              <Link prefetch={false} href="/terms#creator-rights">
                Read our creator promise <ArrowUpRight size={15} />
              </Link>
            </aside>
          </section>
          <div className="community-feed-heading">
            <div>
              <span className="community-eyebrow">THE SHOWCASE</span>
              <h2>
                {mine ? "Your shared moments" : "Through a different lens"}
              </h2>
            </div>
            <div
              className="community-tabs"
              role="group"
              aria-label="Filter videos"
            >
              <button
                aria-pressed={!mine}
                onClick={() => {
                  setMine(false);
                  setPage(0);
                }}
              >
                Latest videos
              </button>
              {signedIn && (
                <button
                  aria-pressed={mine}
                  onClick={() => {
                    setMine(true);
                    setPage(0);
                  }}
                >
                  My posts
                </button>
              )}
            </div>
          </div>
        </>
      )}
      {notice && (
        <p className="community-notice" role="status">
          {notice}
        </p>
      )}
      {loading ? (
        <div
          className="community-skeletons"
          role="status"
          aria-label="Loading community videos"
        >
          {[0, 1, 2].map((i) => (
            <div key={i} />
          ))}
          <span className="sr-only">Loading videos…</span>
        </div>
      ) : error ? (
        <div className="community-empty">
          <Film size={30} />
          <h2>
            {postId
              ? "This moment is unavailable."
              : "The gallery couldn’t load."}
          </h2>
          <p role="alert">{error}</p>
          <button
            className="community-button"
            onClick={() => setReload((r) => r + 1)}
          >
            Try again
          </button>
        </div>
      ) : posts.length ? (
        <div className={postId ? "community-single" : "community-grid"}>
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              onRemove={removed}
              standalone={!!postId}
            />
          ))}
        </div>
      ) : (
        <div className="community-empty">
          <div className="community-empty-icon">
            <Film size={30} />
          </div>
          <span className="community-eyebrow">ROOM FOR YOUR PERSPECTIVE</span>
          <h2>
            {mine
              ? "Your next moment belongs here."
              : postId
                ? "This video has been removed."
                : "Every community starts with a first."}
          </h2>
          <p>
            {mine
              ? "Videos you publish will appear here. Your private creations stay in your account."
              : "Be the first to share a creation. Your video, your credit, your rights."}
          </p>
          <Link
            prefetch={false}
            href="/community/share"
            className="community-button"
          >
            Share a video <ArrowUpRight size={16} />
          </Link>
        </div>
      )}
      {!postId && (page > 0 || hasMore) && (
        <nav className="community-pagination" aria-label="Gallery pages">
          <button
            disabled={loading || page === 0}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </button>
          <span>Page {page + 1}</span>
          <button
            disabled={loading || !hasMore}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </nav>
      )}
    </CommunityShell>
  );
}

function uploadFile(
  url: string,
  file: File,
  contentType: string,
  onProgress: (n: number) => void,
  xhrRef: React.RefObject<XMLHttpRequest | null>,
) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    xhr.open("PUT", url);
    xhr.timeout = 300000;
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.setRequestHeader("cache-control", "max-age=0");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable)
        onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(
            new Error(
              "Upload failed. Please check your connection and try again.",
            ),
          );
    xhr.onerror = () =>
      reject(
        new Error(
          "Upload interrupted. Please check your connection and try again.",
        ),
      );
    xhr.ontimeout = () =>
      reject(
        new Error(
          "Upload timed out. Try a smaller file or a faster connection.",
        ),
      );
    xhr.onabort = () => reject(new Error("Upload canceled."));
    xhr.send(file);
  });
}

export function CommunityShare({ signedIn }: { signedIn: boolean }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [title, setTitle] = useState("");
  const [creator, setCreator] = useState("");
  const [caption, setCaption] = useState("");
  const [consent, setConsent] = useState(false);
  const [aiAssisted, setAiAssisted] = useState(true);
  const [validVideo, setValidVideo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("");
  const [error, setError] = useState("");
  const pending = useRef<{ id: string; file: File } | null>(null);
  const xhr = useRef<XMLHttpRequest | null>(null);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  useEffect(() => () => xhr.current?.abort(), []);
  useEffect(() => {
    if (!busy) return;
    const preventLeave = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", preventLeave);
    return () => window.removeEventListener("beforeunload", preventLeave);
  }, [busy]);
  function selectFile(next?: File) {
    setError("");
    setValidVideo(false);
    setFile(null);
    setPreview("");
    pending.current = null;
    if (!next) return;
    if (
      next.size > COMMUNITY_MAX_BYTES ||
      next.size < 16 ||
      !/\.(mp4|webm)$/i.test(next.name)
    ) {
      setError("Choose an MP4 or WebM video up to 50 MB.");
      return;
    }
    setFile(next);
    setPreview(URL.createObjectURL(next));
  }
  async function publish(e: FormEvent) {
    e.preventDefault();
    if (!file || !consent || !validVideo || busy) return;
    setBusy(true);
    setError("");
    setProgress(0);
    try {
      if (!pending.current || pending.current.file !== file) {
        setStage("Uploading your video");
        const contentType = /\.webm$/i.test(file.name)
          ? "video/webm"
          : "video/mp4";
        const draft = await api<{ id: string; uploadUrl: string }>(
          "/api/community/upload",
          "POST",
          { bytes: file.size, contentType },
        );
        try {
          await uploadFile(
            draft.uploadUrl,
            file,
            contentType,
            setProgress,
            xhr,
          );
        } catch (uploadError) {
          await api(`/api/community/${draft.id}`, "DELETE").catch(() => {});
          throw uploadError;
        }
        pending.current = { id: draft.id, file };
      }
      setStage("Checking and publishing");
      const result = await api<{ id: string }>(
        `/api/community/${pending.current.id}`,
        "POST",
        { title, creator, caption, aiAssisted, consent },
      );
      router.push(`/community/${result.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setStage("");
    }
  }
  return (
    <CommunityShell>
      <div className="community-share-heading">
        <Link prefetch={false} href="/community">
          <ArrowLeft size={16} /> Back to community
        </Link>
        <span className="community-eyebrow">YOUR NEXT SHARED MOMENT</span>
        <h1>
          Made by you.
          <br />
          <span>Seen by the community.</span>
        </h1>
        <p>Publish a video you’re proud of. Keep every right to your work.</p>
      </div>
      {!signedIn ? (
        <div className="community-empty">
          <ShieldCheck size={30} />
          <h2>A little credit for the creator.</h2>
          <p>
            Sign in to publish under your own creator name and manage your
            posts.
          </p>
          <Link
            prefetch={false}
            className="community-button"
            href="/login?next=%2Fcommunity%2Fshare"
          >
            Sign in to share <ArrowUpRight size={16} />
          </Link>
        </div>
      ) : (
        <form onSubmit={publish} className="community-publish-form">
          <div className="community-upload-column">
            <label className="community-file-label" htmlFor="community-file">
              <Upload size={20} />
              <strong>
                {file ? "Choose a different video" : "Choose your video"}
              </strong>
              <span>MP4 or WebM · 4–30 seconds · up to 50 MB</span>
            </label>
            <input
              id="community-file"
              type="file"
              accept=".mp4,.webm,video/mp4,video/webm"
              disabled={busy}
              onChange={(e) => selectFile(e.target.files?.[0])}
            />
            {preview ? (
              <div className="community-upload-preview">
                <video
                  src={preview}
                  controls
                  playsInline
                  preload="metadata"
                  aria-label="Your video preview"
                  onLoadedMetadata={(e) => {
                    const video = e.currentTarget;
                    const valid =
                      Number.isFinite(video.duration) &&
                      video.duration >= 4 &&
                      video.duration <= 30 &&
                      video.videoWidth > 0;
                    setValidVideo(valid);
                    if (!valid)
                      setError(
                        "Choose a playable video between 4 and 30 seconds.",
                      );
                  }}
                  onError={() => {
                    setValidVideo(false);
                    setError(
                      "This browser cannot play the video. Export as MP4 (H.264) or WebM and try again.",
                    );
                  }}
                />
                <p>{file?.name}</p>
              </div>
            ) : (
              <div className="community-preview-placeholder">
                <Film size={44} />
                <p>Your video gets the spotlight.</p>
                <span>Preview it here before publishing.</span>
              </div>
            )}
            <div className="community-upload-promise">
              <ShieldCheck size={22} />
              <p>
                <strong>Your video stays yours.</strong> Publishing grants
                Reelform permission to host and display this post. It does not
                transfer ownership or give us permission to sell your video, use
                it in ads, or train AI models on it.
              </p>
            </div>
          </div>
          <fieldset disabled={busy} className="community-details">
            <legend className="sr-only">Post details</legend>
            <label htmlFor="community-title">
              Give it a title
              <input
                id="community-title"
                required
                maxLength={80}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="A different kind of everyday"
              />
            </label>
            <label htmlFor="community-creator">
              Public creator name
              <input
                id="community-creator"
                required
                maxLength={40}
                value={creator}
                onChange={(e) => setCreator(e.target.value)}
                placeholder="How you want to be credited"
              />
              <small>
                This name appears beside your video. Your email stays private.
              </small>
            </label>
            <label htmlFor="community-caption">
              The story behind it{" "}
              <span className="community-optional">(optional)</span>
              <textarea
                id="community-caption"
                maxLength={500}
                rows={4}
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="What inspired this moment?"
              />
              <small>{caption.length}/500</small>
            </label>
            <label className="community-check">
              <input
                type="checkbox"
                checked={aiAssisted}
                onChange={(e) => setAiAssisted(e.target.checked)}
              />
              <span>
                This video was created or edited with AI.
                <small>We’ll show an AI-assisted label to viewers.</small>
              </span>
            </label>
            <label className="community-check community-consent">
              <input
                type="checkbox"
                required
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              <span>
                I have permission to share this video, including its music and
                anyone featured. I want to make it public and grant Reelform
                permission to host and display it under the{" "}
                <Link
                  prefetch={false}
                  href="/terms#creator-rights"
                  target="_blank"
                  rel="noreferrer"
                >
                  creator terms
                </Link>
                . I retain ownership.
              </span>
            </label>
            <p className="community-public-note">
              Anyone can watch and share the post link. You can remove your post
              anytime; copies other people save may remain.
            </p>
            {error && (
              <p className="community-error" role="alert">
                {error}
              </p>
            )}
            {busy && (
              <div role="status" className="community-progress">
                <span>
                  {stage}
                  {stage === "Uploading your video" ? ` · ${progress}%` : "…"}
                </span>
                <progress
                  max={100}
                  value={
                    stage === "Uploading your video" ? progress : undefined
                  }
                />
              </div>
            )}
            <button
              type="submit"
              className="community-button"
              disabled={
                busy ||
                !validVideo ||
                !consent ||
                !title.trim() ||
                !creator.trim()
              }
            >
              {busy ? "Publishing…" : "Publish to community"}
              <ArrowUpRight size={17} />
            </button>
          </fieldset>
        </form>
      )}
    </CommunityShell>
  );
}
