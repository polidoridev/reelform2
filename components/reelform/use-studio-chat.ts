"use client";

import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_VIDEO_MODEL,
  getVideoModel,
  validateModel,
} from "@/lib/video-models";
import {
  MAX_VIDEO_BYTES,
  MAX_VIDEO_SECONDS,
  MIN_VIDEO_SECONDS,
  MAX_VIDEO_SIZE_LABEL,
  videoContentType,
} from "@/lib/video-limits";
import { scenes } from "@/lib/scenes";

export type Media = { file: File; url: string; contentType?: string };
type Video = Media & { duration: number | null };
type Submission = {
  videoToken: string;
  quoteToken: string;
  requestId: string;
  imageTokens: string[];
  prompt: string;
  resolution: string;
  model: string;
  generateAudio: boolean;
  consent: true;
};
type Job = {
  token: string;
  requestId: string;
  status: string;
  started: number;
  prompt?: string;
  modelName?: string;
  resolution?: string;
};
type Quote = {
  videoToken: string;
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
  const [images, setImages] = useState<Media[]>([]);
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState(DEFAULT_VIDEO_MODEL);
  const [resolution, setResolution] = useState("720p");
  const [audio, setAudio] = useState(false);
  const [consent, setConsent] = useState(false);
  const [ready, setReady] = useState<boolean | null>(null);
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
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
  const assets = useRef(new Set<string>());
  const selection = useRef(0);
  const submitLock = useRef(false);
  const mounted = useRef(true);
  const uploadedVideo = useRef<{
    file: File;
    promise: Promise<string>;
    created: number;
  } | null>(null);
  const selectedModel = getVideoModel(model);
  const jobActive = !!job && !terminal(job.status);
  const busy = !!phase || jobActive || !!pending;
  const quoteKey = JSON.stringify([
    video?.url,
    model,
    resolution,
    audio,
    images.length,
  ]);
  const currentQuote = quote?.key === quoteKey ? quote : null;
  const modelError = (() => {
    if (!video) return "";
    try {
      validateModel(
        selectedModel,
        resolution,
        video.duration ?? 4,
        images.length,
        audio,
      );
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
        if (mounted.current) {
          setReady(data.ready);
          setAuthenticated(data.authenticated);
        }
      })
      .catch(() => {
        if (mounted.current) setReady(false);
      });
    void jsonRequest<{ balance: { total: number }; isAdmin: boolean }>(
      "/api/account",
    )
      .then((data) => {
        if (mounted.current) {
          setCreditBalance(data.balance.total);
          setIsAdmin(data.isAdmin);
        }
      })
      .catch(() => {});
    const scene = scenes.find(
      (s) => s.id === new URLSearchParams(location.search).get("scene"),
    );
    // Initial browser/session state is intentionally restored after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (scene) setPrompt(scene.prompt);
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
          unconfirmed.quoteToken &&
          unconfirmed.videoToken
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
  }, []);

  // Upload once per file; model/settings changes only request a new signed quote.
  // The UI checks the quote key before enabling Send, so stale async responses
  // can never authorize a different model, quality, or attachment selection.
  useEffect(() => {
    if (
      !video ||
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
      setQuotePhase("Preparing your video…");
      try {
        let cached = uploadedVideo.current;
        if (
          !cached ||
          cached.file !== video.file ||
          Date.now() - cached.created > 50 * 60000
        ) {
          const promise = (async () => {
            const { prepareVideo } = await import("@/lib/prepare-video");
            const prepared = await prepareVideo(video.file, (progress) => {
              if (active)
                setQuotePhase(
                  `Preparing video · ${Math.round(progress * 100)}%`,
                );
            });
            if (active) setQuotePhase("Uploading your video…");
            return upload({
              ...video,
              file: prepared,
              contentType: "video/mp4",
            });
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
            : "Creating your new reality",
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

  function media(file: File): Media {
    const url = URL.createObjectURL(file);
    assets.current.add(url);
    return { file, url };
  }
  function release(item: Media) {
    URL.revokeObjectURL(item.url);
    assets.current.delete(item.url);
  }
  async function chooseVideo(file?: File) {
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
    const sequence = ++selection.current;
    setInspecting(true);
    const item = media(file);
    const duration = await new Promise<number | null>((resolve) => {
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
      el.src = item.url;
    });
    if (!mounted.current || sequence !== selection.current) {
      release(item);
      return;
    }
    setInspecting(false);
    if (
      duration !== null &&
      (duration < MIN_VIDEO_SECONDS || duration > MAX_VIDEO_SECONDS)
    ) {
      release(item);
      setError("Choose a video between 4 and 30 seconds.");
      return;
    }
    // Use functional state so quick successive file choices release the actual old URL.
    setVideo((previous) => {
      if (previous) release(previous);
      return { ...item, contentType, duration };
    });
    setQuote(null);
    setQuoteError("");
    return true;
  }
  function removeVideo() {
    selection.current++;
    setInspecting(false);
    if (video) release(video);
    setVideo(null);
    setQuote(null);
    setQuotePhase("");
    setQuoteError("");
  }
  function chooseImages(files: FileList | File[]) {
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
    setImages((previous) => [...previous, ...list.map(media)]);
  }
  function removeImage(item: Media) {
    release(item);
    setImages((previous) => previous.filter((image) => image !== item));
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
      setResolution(next.resolutions[0]);
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
  async function generate() {
    if (submitLock.current || busy) return;
    setError("");
    if (!video || !currentQuote || inspecting) {
      setError("Add a video and wait for its credit cost to finish checking.");
      return;
    }
    if (prompt.trim().length < 10) {
      setError("Describe your transformation in at least 10 characters.");
      return;
    }
    if (!consent) {
      setError("Confirm that you have permission to use these files.");
      return;
    }
    if (!ready || !authenticated) {
      setError("Sign in and check the generation connection before sending.");
      return;
    }
    if (modelError) {
      setError(modelError);
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
    const preview = media(video.file);
    setCurrentMessage({
      id: currentQuote.requestId,
      prompt: prompt.trim(),
      videoUrl: preview.url,
      videoName: video.file.name,
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
      images.length ? "Uploading your reference images" : "Sending your video",
    );
    try {
      const imageTokens = await Promise.all(images.map(upload));
      setPhase("Sending your video");
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
  function newChat() {
    if (busy || submitLock.current) return;
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
    setInspecting(false);
    uploadedVideo.current = null;
  }
  return {
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
    creditBalance,
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
    pollStopped,
    configCheck,
    chooseVideo,
    removeVideo,
    chooseImages,
    removeImage,
    changeModel,
    generate,
    recoverSend,
    newChat,
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
