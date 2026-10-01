"use client";

import { useEffect, useRef, useState } from "react";
import {
  bestResolution,
  DEFAULT_VIDEO_MODEL,
  getVideoModel,
  validateModel,
  type AspectRatio,
} from "@/lib/video-models";
import {
  MAX_VIDEO_BYTES,
  MAX_VIDEO_SECONDS,
  MIN_VIDEO_SECONDS,
  MAX_VIDEO_SIZE_LABEL,
  videoContentType,
} from "@/lib/video-limits";
import { videoEntitlements, validateVideoEntitlements, type PlanAccount } from "@/lib/commerce/entitlements";
import { scenes } from "@/lib/scenes";
import { useCases, type UseCase } from "@/lib/use-cases";
import { editDuration, MAX_EDITABLE_SECONDS, type Edit } from "@/lib/video-edit";
import { referenceProblem, renumberAfterRemoval } from "@/lib/prompt-references";
import type { EditorSource } from "./video-editor";
import type { LibraryItem } from "@/lib/commerce/upload-library";
import {
  loadBackgroundVideos,
  previewUrls,
  saveBackgroundVideos,
  type BackgroundVideo,
} from "./background-videos";

// `libraryId` marks a file picked from the person's saved uploads.
export type Media = { file: File; url: string; contentType?: string; libraryId?: string };
// `source` keeps the original upload and edit list so the editor can reopen them.
type Video = Media & {
  duration: number | null;
  source?: { file: File; duration: number; edit: Edit };
};
type Submission = {
  videoToken?: string;
  quoteToken: string;
  requestId: string;
  imageTokens: string[];
  prompt: string;
  resolution: string;
  model: string;
  generateAudio: boolean;
  consent: true;
};
export type Job = {
  token: string;
  requestId: string;
  status: string;
  started: number;
  prompt?: string;
  modelName?: string;
  resolution?: string;
};
type Quote = {
  videoToken?: string;
  quoteToken: string;
  credits: number;
  duration: number;
  requestId: string;
  created: number;
  key: string;
};
export type ChatMessage = {
  id: string;
  prompt: string;
  videoUrl?: string;
  videoName?: string;
  images: { url: string; name: string }[];
  modelName: string;
  resolution: string;
  result?: string;
  error?: string;
};

class RequestError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
async function jsonRequest<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok)
    throw new RequestError(
      data.error || "This request couldn’t finish. Please try again.",
      response.status,
    );
  return data;
}
async function upload(media: Media) {
  const data = await jsonRequest<{
    uploadUrl: string;
    headers: Record<string, string>;
    token: string;
  }>("/api/uploads", {
    contentType: media.contentType || media.file.type,
    size: media.file.size,
  });
  const response = await fetch(data.uploadUrl, {
    method: "PUT",
    headers: data.headers,
    body: media.file,
  });
  if (!response.ok)
    throw new Error(
      "Your file couldn’t upload. Check your connection and try again.",
    );
  return data.token;
}

// Fingerprint used to avoid saving the same file twice. Very large files get a
// random one instead of being read into memory.
async function fileHash(file: File) {
  const bytes = file.size <= 512 * 1024 * 1024
    ? new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()))
    : crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
// Saves an uploaded file to the person's library. Saving never blocks or fails a generation.
function saveToLibrary(token: string, file: File, duration: number | null) {
  void fileHash(file)
    .then((hash) => jsonRequest("/api/library", { token, name: file.name.slice(0, 200) || "Upload", hash, duration }))
    .catch(() => {});
}
// Upload token for a saved file, so it isn't uploaded from this device again.
async function libraryToken(id: string) {
  return (await jsonRequest<{ token: string }>(`/api/library/${id}`, {})).token;
}

function probeDuration(url: string) {
  return new Promise<number | null>((resolve) => {
    const el = document.createElement("video");
    const finish = (value: number | null) => {
      clearTimeout(timer);
      el.onloadedmetadata = null;
      el.onerror = null;
      el.removeAttribute("src");
      el.load();
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), 10000);
    el.preload = "metadata";
    el.onloadedmetadata = () =>
      finish(Number.isFinite(el.duration) ? el.duration : null);
    el.onerror = () => finish(null);
    el.src = url;
  });
}
const minutes = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;

const ACTIVE_JOB = "reelform-active-job";
const PENDING_SEND = "reelform-pending-send";
const terminal = (status: string) =>
  ["completed", "failed", "nsfw", "canceled"].includes(status);
function saveSession(key: string, data: unknown) {
  try {
    if (data === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify(data));
  } catch {
    /* In-memory state still protects the current tab. */
  }
}

export function useStudioChat() {
  const [video, setVideo] = useState<Video | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<UseCase | null>(null);
  const [images, setImages] = useState<Media[]>([]);
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState(DEFAULT_VIDEO_MODEL);
  // null follows the model's best quality for the plan; set once the user picks one.
  const [chosenResolution, setResolution] = useState<string | null>(null);
  const [audio, setAudio] = useState(false);
  // Length and shape for videos created without a source video.
  const [createSeconds, setCreateSeconds] = useState(5);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("16:9");
  const [consent, setConsent] = useState(false);
  const [ready, setReady] = useState<boolean | null>(null);
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [planAccount, setPlanAccount] = useState<PlanAccount | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [generationError, setGenerationError] = useState("");
  const [quoteError, setQuoteError] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quotePhase, setQuotePhase] = useState("");
  const [quoteAttempt, setQuoteAttempt] = useState(0);
  const [inspecting, setInspecting] = useState(false);
  const [phase, setPhase] = useState("");
  const [job, setJob] = useState<Job | null>(null);
  const [result, setResult] = useState("");
  const [pollStopped, setPollStopped] = useState(false);
  const [pollAttempt, setPollAttempt] = useState(0);
  const [pending, setPending] = useState<Submission | null>(null);
  const [currentMessage, setCurrentMessage] = useState<ChatMessage | null>(
    null,
  );
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [editor, setEditor] = useState<EditorSource | null>(null);
  const [openingEditor, setOpeningEditor] = useState(false);
  // null until restored after hydration, so the empty default is never saved over it.
  const [background, setBackground] = useState<BackgroundVideo[] | null>(null);
  const [backgroundRound, setBackgroundRound] = useState(0);
  const assets = useRef(new Set<string>());
  const selection = useRef(0);
  const submitLock = useRef(false);
  const mounted = useRef(true);
  const uploadedVideo = useRef<{
    file: File;
    promise: Promise<string>;
    created: number;
  } | null>(null);
  // Reference photos upload as soon as they're added, so they're saved even if unsent.
  const uploadedImages = useRef(new Map<File, { promise: Promise<string>; created: number }>());
  const [library, setLibrary] = useState<LibraryItem[] | null>(null);
  const [libraryError, setLibraryError] = useState("");
  const [openingUpload, setOpeningUpload] = useState<string | null>(null);
  const entitlements = videoEntitlements(planAccount, isAdmin);
  const selectedModel = getVideoModel(model);
  const resolution = chosenResolution ?? bestResolution(selectedModel, entitlements.fullHd);
  const jobActive = !!job && !terminal(job.status);
  const busy = !!phase || jobActive || !!pending;
  // A generating video can move to the background; an unconfirmed send can't.
  const canLeave = !pending && (!phase || jobActive);
  const backgroundVideos = background ?? [];
  const generatingElsewhere = backgroundVideos.filter((item) => !item.done).length;
  // Video-optional models can create from a prompt (and photos) alone.
  const creating = !video && selectedModel.video === "optional";
  const maxCreateSeconds = Math.min(selectedModel.maxSeconds, entitlements.maxSeconds);
  const seconds = Math.min(createSeconds, maxCreateSeconds);
  const quoteKey = JSON.stringify([
    video?.url,
    model,
    resolution,
    audio,
    images.length,
    creating ? [seconds, aspectRatio] : null,
  ]);
  const currentQuote = quote?.key === quoteKey ? quote : null;
  // Only flag mentions once there is something to send, so presets can be picked first.
  const presetReferenceError = selectedPreset?.referenceCount && images.length < selectedPreset.referenceCount
    ? `Add ${selectedPreset.referenceCount} reference photos for ${selectedPreset.shortLabel}. Photos are numbered in the order you add them.`
    : "";
  const promptError = presetReferenceError || (video || creating ? referenceProblem(prompt, images.length, !!video) ?? "" : "");
  const modelError = (() => {
    if (!video && !creating) return "";
    const duration = video ? video.duration ?? 4 : seconds;
    try {
      validateVideoEntitlements(entitlements, { resolution, duration, imageCount: images.length, generateAudio: audio });
      validateModel(selectedModel, resolution, duration, images.length, audio, !!video);
      return "";
    } catch (e) {
      return (e as Error).message;
    }
  })();

  function configCheck() {
    setReady(null);
    void jsonRequest<{ ready: boolean; authenticated: boolean }>("/api/config")
      .then((data) => {
        setReady(data.ready);
        setAuthenticated(data.authenticated);
      })
      .catch(() => {
        setReady(false);
      });
  }
  useEffect(() => {
    mounted.current = true;
    void jsonRequest<{ ready: boolean; authenticated: boolean }>("/api/config")
      .then((data) => {
        if (!mounted.current) return;
        setReady(data.ready);
        setAuthenticated(data.authenticated);
        // Signed-out visitors have no account to load (and would get a 401).
        if (!data.authenticated) return;
        return jsonRequest<{ balance: { total: number }; isAdmin: boolean; account: PlanAccount }>(
          "/api/account",
        )
          .then((account) => {
            if (mounted.current) {
              setCreditBalance(account.balance.total);
              setIsAdmin(account.isAdmin);
              setPlanAccount(account.account);
            }
          })
          .catch(() => {});
      })
      .catch(() => {
        if (mounted.current) setReady(false);
      });
    const scene = scenes.find(
      (s) => s.id === new URLSearchParams(location.search).get("scene"),
    );
    // Initial browser/session state is intentionally restored after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBackground(loadBackgroundVideos());
    if (scene) setPrompt(scene.prompt);
    // Opened from My creations: load that saved video into the editor.
    const editId = new URLSearchParams(location.search).get("edit");
    if (editId && /^[0-9a-f-]{36}$/i.test(editId)) {
      const url = new URL(location.href);
      url.searchParams.delete("edit");
      window.history.replaceState(window.history.state, "", url);
      void editResult(`/api/videos/${editId}`);
    }
    const preset = useCases.find(
      (item) => item.id === new URLSearchParams(location.search).get("useCase"),
    );
    if (preset) {
      void choosePreset(preset);
    }
    try {
      const saved = JSON.parse(
        sessionStorage.getItem(ACTIVE_JOB) || "null",
      ) as Job | null;
      if (saved?.token && saved.started > Date.now() - 7 * 86400000) {
        setJob(saved);
        setCurrentMessage({
          id: saved.requestId,
          prompt: saved.prompt || "Your video transformation",
          images: [],
          modelName: saved.modelName || "Video generation",
          resolution: saved.resolution || "",
        });
      } else {
        saveSession(ACTIVE_JOB, null);
        const unconfirmed = JSON.parse(
          sessionStorage.getItem(PENDING_SEND) || "null",
        ) as Submission | null;
        if (
          unconfirmed?.requestId &&
          unconfirmed.quoteToken
        ) {
          setPending(unconfirmed);
          setCurrentMessage({
            id: unconfirmed.requestId,
            prompt: unconfirmed.prompt,
            images: [],
            modelName: getVideoModel(unconfirmed.model).name,
            resolution: unconfirmed.resolution,
          });
          setGenerationError(
            "The last send wasn’t confirmed. Check that request before creating another video.",
          );
        }
      }
    } catch {
      saveSession(PENDING_SEND, null);
    }
    const urls = assets.current;
    return () => {
      mounted.current = false;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
    // Mount-only: restores session state and URL intents once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Upload once per file; model/settings changes only request a new signed quote.
  // The UI checks the quote key before enabling Send, so stale async responses
  // can never authorize a different model, quality, or attachment selection.
  useEffect(() => {
    if (
      (!video && !creating) ||
      !ready ||
      !authenticated ||
      inspecting ||
      modelError ||
      pending ||
      jobActive
    )
      return;
    let active = true;
    const timer = setTimeout(async () => {
      setQuote(null);
      setQuoteError("");
      try {
        if (!video) {
          // Nothing to upload: quote the chosen length and shape directly.
          setQuotePhase("Checking the credit cost…");
          const data = await jsonRequest<{ quoteToken: string; credits: number; duration: number }>("/api/quote", {
            model,
            resolution,
            imageCount: images.length,
            generateAudio: audio,
            duration: seconds,
            aspectRatio,
          });
          if (active)
            setQuote({ ...data, requestId: crypto.randomUUID(), created: Date.now(), key: quoteKey });
          return;
        }
        setQuotePhase("Preparing your video…");
        let cached = uploadedVideo.current;
        if (
          !cached ||
          cached.file !== video.file ||
          Date.now() - cached.created > 50 * 60000
        ) {
          const libraryId = video.libraryId;
          const promise = libraryId ? libraryToken(libraryId) : (async () => {
            const { prepareVideo } = await import("@/lib/prepare-video");
            const prepared = await prepareVideo(video.file, (progress) => {
              if (active)
                setQuotePhase(
                  `Preparing video · ${Math.round(progress * 100)}%`,
                );
            });
            if (active) setQuotePhase("Uploading your video…");
            const token = await upload({
              ...video,
              file: prepared,
              contentType: "video/mp4",
            });
            saveToLibrary(token, prepared, video.duration);
            return token;
          })();
          cached = { file: video.file, promise, created: Date.now() };
          uploadedVideo.current = cached;
        }
        let videoToken: string;
        try {
          videoToken = await cached.promise;
        } catch (e) {
          if (uploadedVideo.current === cached) uploadedVideo.current = null;
          throw e;
        }
        if (!active) return;
        setQuotePhase("Checking your video and credit cost…");
        const data = await jsonRequest<{
          quoteToken: string;
          credits: number;
          duration: number;
        }>("/api/quote", {
          videoToken,
          model,
          resolution,
          imageCount: images.length,
          generateAudio: audio,
        });
        if (active)
          setQuote({
            ...data,
            videoToken,
            requestId: crypto.randomUUID(),
            created: Date.now(),
            key: quoteKey,
          });
      } catch (e) {
        if (active) setQuoteError((e as Error).message);
      } finally {
        if (active) setQuotePhase("");
      }
    }, 350);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [
    video,
    creating,
    seconds,
    aspectRatio,
    ready,
    authenticated,
    inspecting,
    modelError,
    model,
    resolution,
    images.length,
    audio,
    quoteKey,
    quoteAttempt,
    pending,
    jobActive,
  ]);

  const jobToken = job?.token;
  const jobFinished = !!job && terminal(job.status);
  useEffect(() => {
    if (!jobToken || jobFinished) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0,
      errors = 0;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPollStopped(false);
    async function poll() {
      try {
        const data = await jsonRequest<{
          status: string;
          videoUrl?: string;
          error?: string;
          balance?: number;
        }>(`/api/jobs?token=${encodeURIComponent(jobToken!)}`);
        if (disposed) return;
        errors = 0;
        if (typeof data.balance === "number") setCreditBalance(data.balance);
        setJob((prev) => (prev ? { ...prev, status: data.status } : null));
        if (data.status === "completed") {
          if (data.videoUrl) setResult(data.videoUrl);
          else
            setGenerationError(
              "Your video completed, but the download isn’t available. Contact support with the generation ID.",
            );
          setPhase("");
          saveSession(ACTIVE_JOB, null);
          return;
        }
        if (terminal(data.status)) {
          setGenerationError(
            data.error ||
              "This video couldn’t finish. Try a different clip or a simpler description.",
          );
          setPhase("");
          saveSession(ACTIVE_JOB, null);
          return;
        }
        if (data.status === "unknown") {
          setGenerationError(
            data.error ||
              "This request needs review. Contact support with the generation ID before resubmitting.",
          );
          setPollStopped(true);
          setPhase("");
          return;
        }
        setPhase(
          data.status === "queued"
            ? "Your video is in the queue"
            : "Creating your video",
        );
      } catch (e) {
        if (disposed) return;
        if (++errors >= 3) {
          setGenerationError((e as Error).message);
          setPollStopped(true);
          setPhase("");
          return;
        }
      }
      if (++attempts >= 150) {
        setPollStopped(true);
        setPhase("");
        return;
      }
      timer = setTimeout(poll, Math.min(5000 + attempts * 500, 15000));
    }
    void poll();
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [jobToken, jobFinished, pollAttempt]);

  useEffect(() => {
    if (background) saveBackgroundVideos(background);
  }, [background]);

  // Checks videos generating in the background; each finished one gets a banner.
  const backgroundTokens = backgroundVideos
    .filter((item) => !item.done)
    .map((item) => item.job.token)
    .join(" ");
  useEffect(() => {
    if (!backgroundTokens) return;
    let disposed = false;
    const timer = setTimeout(async () => {
      for (const token of backgroundTokens.split(" ")) {
        try {
          const data = await jsonRequest<{
            status: string;
            videoUrl?: string;
            error?: string;
            balance?: number;
          }>(`/api/jobs?token=${encodeURIComponent(token)}`);
          if (disposed) return;
          if (typeof data.balance === "number") setCreditBalance(data.balance);
          const done = terminal(data.status) || data.status === "unknown";
          setBackground((items) =>
            (items ?? []).map((item) =>
              item.job.token !== token
                ? item
                : {
                    ...item,
                    job: { ...item.job, status: data.status },
                    done,
                    ...(data.status === "completed"
                      ? data.videoUrl
                        ? { result: data.videoUrl }
                        : { error: "Your video completed, but the download isn’t available. Contact support with the generation ID." }
                      : done
                        ? {
                            error:
                              data.error ||
                              (data.status === "unknown"
                                ? "This request needs review. Contact support with the generation ID before resubmitting."
                                : "This video couldn’t finish. Try a different clip or a simpler description."),
                          }
                        : {}),
                  },
            ),
          );
        } catch {
          if (disposed) return;
          // Keep checking; the next round retries.
        }
      }
      if (!disposed) setBackgroundRound((n) => n + 1);
    }, 8000);
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [backgroundTokens, backgroundRound]);

  function media(file: File): Media {
    const url = URL.createObjectURL(file);
    assets.current.add(url);
    return { file, url };
  }
  function release(item: Media) {
    URL.revokeObjectURL(item.url);
    assets.current.delete(item.url);
  }
  async function choosePreset(preset: UseCase) {
    if (busy || submitLock.current) return;
    const sequence = ++selection.current;
    setPrompt(preset.prompt);
    setModel(preset.model);
    setResolution(null);
    setAudio(false);
    setSelectedPreset(null);
    setError("");
    setInspecting(!!preset.sourceVideo);
    if (!preset.sourceVideo) return;
    // Clear the old clip so a failed download cannot submit the preset with it.
    setVideo((previous) => {
      if (previous) release(previous);
      return null;
    });
    setQuote(null);
    setQuoteError("");
    try {
      const response = await fetch(preset.sourceVideo);
      if (!response.ok) throw new Error("Couldn’t load this preset’s video. Select the preset again to retry.");
      const blob = await response.blob();
      if (!mounted.current || sequence !== selection.current) return;
      const loaded = await chooseVideo(new File([blob], `${preset.shortLabel}.mp4`, { type: "video/mp4" }), undefined, sequence);
      if (loaded && mounted.current && sequence === selection.current) setSelectedPreset(preset);
    } catch (e) {
      if (mounted.current && sequence === selection.current) setError((e as Error).message);
    } finally {
      if (mounted.current && sequence === selection.current) setInspecting(false);
    }
  }
  async function chooseVideo(file?: File, libraryId?: string, presetSequence?: number) {
    if (!file || busy || submitLock.current) return;
    setError("");
    const contentType = videoContentType(file);
    if (!contentType) {
      setError("Choose an MP4, MOV, M4V, or WebM video.");
      return;
    }
    if (!file.size || file.size > MAX_VIDEO_BYTES) {
      setError(`Choose a video up to ${MAX_VIDEO_SIZE_LABEL}.`);
      return;
    }
    const sequence = presetSequence ?? ++selection.current;
    setSelectedPreset(null);
    setInspecting(true);
    const item = media(file);
    const duration = await probeDuration(item.url);
    if (!mounted.current || sequence !== selection.current) {
      release(item);
      return;
    }
    setInspecting(false);
    if (
      duration !== null &&
      (duration < MIN_VIDEO_SECONDS || duration > MAX_EDITABLE_SECONDS)
    ) {
      release(item);
      setError(
        duration < MIN_VIDEO_SECONDS
          ? `Choose a video at least ${MIN_VIDEO_SECONDS} seconds long.`
          : `Choose a video up to ${MAX_EDITABLE_SECONDS / 60} minutes long. You can trim it to ${MAX_VIDEO_SECONDS} seconds in the editor.`,
      );
      return;
    }
    // Longer footage goes straight to the editor to be trimmed before upload.
    if (duration !== null && duration > MAX_VIDEO_SECONDS) {
      release(item);
      setEditor({
        file,
        duration,
        origin: "upload",
        notice: `This video is ${minutes(duration)} long. Trim it to ${Math.min(MAX_VIDEO_SECONDS, entitlements.maxSeconds)} seconds or less to use it in the studio.`,
      });
      return true;
    }
    // Use functional state so quick successive file choices release the actual old URL.
    setVideo((previous) => {
      if (previous) release(previous);
      return { ...item, contentType, duration, libraryId };
    });
    setQuote(null);
    setQuoteError("");
    return true;
  }
  function editVideo() {
    if (!video || video.duration === null || busy || submitLock.current) return;
    setError("");
    setEditor(
      video.source
        ? { ...video.source, origin: "upload" }
        : { file: video.file, duration: video.duration, origin: "upload" },
    );
  }
  // Loads a finished video so it can be edited, downloaded, or sent back to the AI.
  async function editResult(url: string) {
    if (busy || submitLock.current || openingEditor) return;
    setError("");
    setOpeningEditor(true);
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error();
      const blob = await response.blob();
      const file = new File([blob], "reelform-video.mp4", { type: "video/mp4" });
      const probe = URL.createObjectURL(file);
      const duration = await probeDuration(probe);
      URL.revokeObjectURL(probe);
      if (!duration) throw new Error();
      if (mounted.current) setEditor({ file, duration, origin: "result" });
    } catch {
      if (mounted.current)
        setError(
          "This video couldn’t be opened in the editor. Download it, then upload it to edit.",
        );
    } finally {
      if (mounted.current) setOpeningEditor(false);
    }
  }
  function applyEdit(file: File, edit: Edit) {
    if (!editor || busy || submitLock.current) return;
    selection.current++;
    const item = media(file);
    const source = { file: editor.file, duration: editor.duration, edit };
    setVideo((previous) => {
      if (previous) release(previous);
      return {
        ...item,
        contentType: videoContentType(file) ?? "video/mp4",
        duration: editDuration(edit),
        source,
      };
    });
    setEditor(null);
    setQuote(null);
    setQuoteError("");
    setError("");
  }
  function removeVideo() {
    setSelectedPreset(null);
    selection.current++;
    setInspecting(false);
    if (video) release(video);
    setVideo(null);
    setQuote(null);
    setQuotePhase("");
    setQuoteError("");
  }
  function imageToken(item: Media) {
    const cached = uploadedImages.current.get(item.file);
    if (cached && Date.now() - cached.created < 50 * 60000) return cached.promise;
    const promise = item.libraryId
      ? libraryToken(item.libraryId)
      : upload(item).then((token) => {
          saveToLibrary(token, item.file, null);
          return token;
        });
    const entry = { promise, created: Date.now() };
    uploadedImages.current.set(item.file, entry);
    // A failed upload is retried when the video is sent.
    promise.catch(() => {
      if (uploadedImages.current.get(item.file) === entry) uploadedImages.current.delete(item.file);
    });
    return promise;
  }
  function chooseImages(files: FileList | File[], libraryId?: string) {
    if (busy || submitLock.current) return;
    const list = Array.from(files);
    setError("");
    if (images.length + list.length > selectedModel.maxImages) {
      setError(
        `${selectedModel.name} accepts up to ${selectedModel.maxImages} reference images.`,
      );
      return;
    }
    if (
      list.some(
        (file) =>
          !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
          !file.size ||
          file.size > 10 * 1024 * 1024,
      )
    ) {
      setError("Use JPG, PNG, or WebP reference images, up to 10 MB each.");
      return;
    }
    const added = list.map((file) => ({ ...media(file), libraryId }));
    setImages((previous) => [...previous, ...added]);
    if (authenticated) added.forEach((item) => void imageToken(item).catch(() => {}));
  }
  function removeImage(item: Media) {
    const index = images.indexOf(item);
    uploadedImages.current.delete(item.file);
    release(item);
    setImages((previous) => previous.filter((image) => image !== item));
    if (index >= 0 && !selectedPreset) setPrompt((text) => renumberAfterRemoval(text, index + 1));
  }
  function changeModel(value: string, quality?: string) {
    const next = getVideoModel(value);
    setModel(value);
    setQuote(null);
    setError("");
    if (quality) setResolution(quality);
    else if (
      !next.resolutions.includes(resolution as "480p" | "720p" | "1080p")
    )
      setResolution(null);
    if (!next.audio) setAudio(false);
  }
  async function sendRequest(payload: Submission, recovering = false) {
    // Persist the exact request before submission. Retrying an interrupted send
    // reuses its idempotency ID rather than authorizing another paid generation.
    setPending(payload);
    saveSession(PENDING_SEND, payload);
    try {
      const data = await jsonRequest<{
        token: string;
        requestId: string;
        status: string;
        balance: number;
        error?: string;
      }>("/api/generate", payload);
      const active = {
        ...data,
        // An interrupted send may recover after completion. Fetch its playback
        // URL through the job endpoint before displaying the finished state.
        status: data.status === "completed" ? "in_progress" : data.status,
        started: Date.now(),
        prompt: payload.prompt,
        modelName: getVideoModel(payload.model).name,
        resolution: payload.resolution,
      };
      setJob(active);
      setPrompt("");
      setQuote(null);
      setCreditBalance(data.balance);
      setPending(null);
      saveSession(PENDING_SEND, null);
      if (terminal(active.status)) {
        setGenerationError(
          data.error ||
            "The video couldn’t start. Check your account for returned credits.",
        );
        setPhase("");
        saveSession(ACTIVE_JOB, null);
      } else {
        saveSession(ACTIVE_JOB, active);
        setPhase("Your video is in the queue");
      }
    } catch (e) {
      if (!recovering && e instanceof RequestError && e.status < 500) {
        setPending(null);
        saveSession(PENDING_SEND, null);
      }
      throw e;
    }
  }
  const needsConsent = !!video || images.length > 0;
  async function generate() {
    if (submitLock.current || busy) return;
    setError("");
    if ((!video && !creating) || !currentQuote || inspecting) {
      setError(
        creating
          ? "Wait for the credit cost to finish checking."
          : "Add a video and wait for its credit cost to finish checking.",
      );
      return;
    }
    if (prompt.trim().length < 10) {
      setError("Describe your video in at least 10 characters.");
      return;
    }
    // Permission is only needed for files the person supplies.
    if (needsConsent && !consent) {
      setError("Confirm that you have permission to use these files.");
      return;
    }
    if (!ready || !authenticated) {
      setError("Sign in and check the generation connection before sending.");
      return;
    }
    if (modelError || promptError) {
      setError(modelError || promptError);
      return;
    }
    if (Date.now() - currentQuote.created > 14 * 60000) {
      setQuote(null);
      setQuoteAttempt((n) => n + 1);
      setError("Refreshing your credit cost. Press Send when it’s ready.");
      return;
    }
    if (creditBalance !== null && creditBalance < currentQuote.credits) {
      setError("Add credits to your account to send this video.");
      return;
    }
    submitLock.current = true;
    if (currentMessage)
      setHistory((previous) => [
        ...previous,
        { ...currentMessage, result, error: generationError },
      ]);
    setCurrentMessage({
      id: currentQuote.requestId,
      prompt: prompt.trim(),
      ...(video ? { videoUrl: media(video.file).url, videoName: video.file.name } : {}),
      images: images.map((image) => ({
        url: media(image.file).url,
        name: image.file.name,
      })),
      modelName: selectedModel.name,
      resolution,
    });
    setResult("");
    setGenerationError("");
    setJob(null);
    setPhase(
      images.length ? "Uploading your reference images" : "Sending your request",
    );
    try {
      const imageTokens = await Promise.all(images.map(imageToken));
      setPhase("Sending your request");
      await sendRequest({
        videoToken: currentQuote.videoToken,
        quoteToken: currentQuote.quoteToken,
        requestId: currentQuote.requestId,
        imageTokens,
        prompt: prompt.trim(),
        resolution,
        model,
        generateAudio: audio,
        consent: true,
      });
    } catch (e) {
      setGenerationError((e as Error).message);
      setPhase("");
    } finally {
      submitLock.current = false;
    }
  }
  async function recoverSend() {
    if (!pending || submitLock.current) return;
    submitLock.current = true;
    setGenerationError("");
    setPhase("Checking your previous request");
    try {
      await sendRequest(pending, true);
    } catch (e) {
      setGenerationError((e as Error).message);
      setPhase("");
    } finally {
      submitLock.current = false;
    }
  }
  // Moves a still-generating conversation aside so a new one can start.
  function moveToBackground() {
    if (!currentMessage || !job || !jobActive) return;
    const message = currentMessage;
    const moved: BackgroundVideo = {
      id: job.requestId,
      history,
      message,
      job,
      done: false,
    };
    previewUrls([...history, message]).forEach((url) => assets.current.delete(url));
    setBackground((items) => [...(items ?? []).filter((item) => item.id !== moved.id), moved]);
    saveSession(ACTIVE_JOB, null);
  }
  function newChat() {
    if (!canLeave || submitLock.current) return;
    moveToBackground();
    clearChat();
  }
  function clearChat() {
    setSelectedPreset(null);
    selection.current++;
    assets.current.forEach((url) => URL.revokeObjectURL(url));
    assets.current.clear();
    setVideo(null);
    setImages([]);
    setPrompt("");
    setConsent(false);
    setQuote(null);
    setQuotePhase("");
    setQuoteError("");
    setError("");
    setGenerationError("");
    setCurrentMessage(null);
    setHistory([]);
    setResult("");
    setJob(null);
    setPhase("");
    setPollStopped(false);
    setInspecting(false);
    setEditor(null);
    uploadedVideo.current = null;
    uploadedImages.current.clear();
  }
  // Brings a background conversation back. The composer keeps any draft.
  function openBackground(id: string) {
    const item = backgroundVideos.find((entry) => entry.id === id);
    if (!item || !canLeave || submitLock.current) return;
    moveToBackground();
    if (currentMessage && !jobActive)
      previewUrls([...history, currentMessage]).forEach((url) => {
        URL.revokeObjectURL(url);
        assets.current.delete(url);
      });
    previewUrls([...item.history, item.message]).forEach((url) => assets.current.add(url));
    setBackground((items) => (items ?? []).filter((entry) => entry.id !== id));
    setHistory(item.history);
    setCurrentMessage(item.message);
    setJob(item.job);
    setResult(item.result ?? "");
    setGenerationError(item.error ?? "");
    setPollStopped(false);
    setPhase(item.done ? "" : "Creating your video");
    saveSession(ACTIVE_JOB, item.done ? null : item.job);
  }
  // A dismissed video stays in My creations.
  function dismissBackground(id: string) {
    setBackground((items) => (items ?? []).filter((entry) => entry.id !== id));
  }
  async function loadLibrary() {
    setLibraryError("");
    try {
      const data = await jsonRequest<{ items: LibraryItem[] }>("/api/library");
      if (mounted.current) setLibrary(data.items);
    } catch (e) {
      if (mounted.current) setLibraryError((e as Error).message);
    }
  }
  // Brings a saved upload back into the composer without the person choosing the file again.
  async function pickFromLibrary(item: LibraryItem) {
    if (busy || submitLock.current || openingUpload) return;
    setError("");
    setOpeningUpload(item.id);
    try {
      const response = await fetch(item.url);
      if (!response.ok) throw new Error();
      const file = new File([await response.blob()], item.name, { type: item.content_type });
      if (!mounted.current) return;
      if (item.kind === "video") await chooseVideo(file, item.id);
      else chooseImages([file], item.id);
    } catch {
      if (mounted.current) setError("This saved upload couldn’t be opened. Please try again.");
    } finally {
      if (mounted.current) setOpeningUpload(null);
    }
  }
  async function deleteFromLibrary(id: string) {
    setLibraryError("");
    try {
      const response = await fetch(`/api/library/${id}`, { method: "DELETE", cache: "no-store" });
      if (!response.ok && response.status !== 404) throw new Error();
      setLibrary((items) => items?.filter((item) => item.id !== id) ?? null);
      // Anything still attached from it uploads normally from now on.
      setVideo((current) => (current?.libraryId === id ? { ...current, libraryId: undefined } : current));
      setImages((current) =>
        current.some((image) => image.libraryId === id)
          ? current.map((image) => (image.libraryId === id ? { ...image, libraryId: undefined } : image))
          : current,
      );
    } catch {
      setLibraryError("That upload couldn’t be deleted. Please try again.");
    }
  }
  return {
    selectedPreset,
    choosePreset,
    video,
    images,
    prompt,
    setPrompt,
    model,
    selectedModel,
    resolution,
    setResolution,
    audio,
    setAudio,
    consent,
    setConsent,
    ready,
    authenticated,
    isAdmin,
    entitlements,
    creditBalance,
    creditPlan: planAccount?.plan ?? "free",
    error,
    setError,
    generationError,
    quote: currentQuote,
    quotePhase,
    quoteError,
    inspecting,
    busy,
    phase,
    job,
    jobActive,
    result,
    pending,
    currentMessage,
    history,
    modelError,
    promptError,
    creating,
    needsConsent,
    createSeconds: seconds,
    setCreateSeconds,
    maxCreateSeconds,
    aspectRatio,
    setAspectRatio,
    pollStopped,
    configCheck,
    chooseVideo,
    removeVideo,
    editor,
    openingEditor,
    editVideo,
    editResult,
    applyEdit,
    closeEditor: () => setEditor(null),
    chooseImages,
    removeImage,
    changeModel,
    generate,
    recoverSend,
    newChat,
    canLeave,
    backgroundVideos,
    generatingElsewhere,
    openBackground,
    dismissBackground,
    library,
    libraryError,
    openingUpload,
    loadLibrary,
    pickFromLibrary,
    deleteFromLibrary,
    retryQuote: () => {
      setQuote(null);
      setQuoteAttempt((n) => n + 1);
    },
    checkGeneration: () => {
      setGenerationError("");
      setPollAttempt((n) => n + 1);
    },
  };
}
