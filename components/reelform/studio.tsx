"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Upload,
  ImagePlus,
  X,
  Plus,
  Sparkles,
  Film,
  Play,
  Download,
  ShieldCheck,
  WandSparkles,
  Info,
  Check,
  RefreshCw,
} from "lucide-react";
import Brand from "./brand";
import AppSelect from "./app-select";
import { MIN_VIDEO_SECONDS, MAX_VIDEO_SECONDS } from "@/lib/video-limits";
import { scenes } from "@/lib/scenes";

type Media = { file: File; url: string };
type Job = {
  token: string;
  requestId: string;
  status: string;
  started: number;
};
async function jsonRequest<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok)
    throw new Error(
      data.error || "The request could not be completed. Please try again.",
    );
  return data;
}
async function upload(media: Media) {
  const data = await jsonRequest<{
    uploadUrl: string;
    headers: Record<string, string>;
    token: string;
  }>("/api/uploads", { contentType: media.file.type, size: media.file.size });
  const uploaded = await fetch(data.uploadUrl, {
    method: "PUT",
    headers: data.headers,
    body: media.file,
  });
  if (!uploaded.ok)
    throw new Error(
      "Your file could not be uploaded. Please check your connection and try again.",
    );
  return data.token as string;
}
export default function Studio() {
  const [quote, setQuote] = useState<{
    videoToken: string;
    quoteToken: string;
    credits: number;
    duration: number;
    requestId: string;
  } | null>(null);
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [video, setVideo] = useState<(Media & { duration: number }) | null>(null);
  const [images, setImages] = useState<Media[]>([]);
  const [prompt, setPrompt] = useState("");
  const [resolution, setResolution] = useState("720p");
  const [audio, setAudio] = useState(false);
  const [consent, setConsent] = useState(false);
  const [authenticated, setAuthenticated] = useState(true);
  const [ready, setReady] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const [phase, setPhase] = useState("");
  const [job, setJob] = useState<Job | null>(null);
  const [result, setResult] = useState("");
  const [example, setExample] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [pollStopped, setPollStopped] = useState(false);
  const [pollAttempt, setPollAttempt] = useState(0);
  const [activeScene, setActiveScene] = useState(scenes[0]);
  const submitLock = useRef(false);
  const assets = useRef<Set<string>>(new Set());
  const configCheck = () =>
    jsonRequest<{ ready: boolean; authenticated: boolean }>("/api/config")
      .then((data) => {
        setReady(data.ready);
        setAuthenticated(data.authenticated);
      })
      .catch(() => setReady(false));
  useEffect(() => {
    fetch("/api/account")
      .then(async (r) => {
        if (r.ok) {
          const d = (await r.json()) as { balance: { total: number } };
          setCreditBalance(d.balance.total);
        }
      })
      .catch(() => {});
    configCheck();
    const scene = scenes.find(
      (s) => s.id === new URLSearchParams(window.location.search).get("scene"),
    );
    if (scene) {
      // Browser query state is read after hydration.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPrompt(scene.prompt);
      setActiveScene(scene);
    }
    try {
      const saved = sessionStorage.getItem("reelform-active-job");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.token && parsed.started > Date.now() - 7 * 86400000)
          setJob(parsed);
        else sessionStorage.removeItem("reelform-active-job");
      }
    } catch {}
    const urls = assets.current;
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, []);
  const jobToken = job?.token;
  const jobFinished =
    !!job && ["completed", "failed", "nsfw", "canceled"].includes(job.status);
  useEffect(() => {
    if (!jobToken || jobFinished) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    let tries = 0;
    let errors = 0;
    // Reset the polling UI when subscribing to a new job.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPollStopped(false);
    async function poll() {
      if (disposed) return;
      try {
        const data = await jsonRequest<{
          status: string;
          videoUrl: string;
          error?: string;
          balance?: number;
        }>(`/api/jobs?token=${encodeURIComponent(jobToken!)}`);
        if (disposed) return;
        errors = 0;
        if (typeof data.balance === "number") setCreditBalance(data.balance);
        if (data.status === "completed") {
          if (!data.videoUrl) {
            setError(
              "Your generation completed, but no video was returned. Contact Reelform support with your generation ID.",
            );
          } else {
            setResult(data.videoUrl);
            setExample(false);
          }
          setJob((prev) => (prev ? { ...prev, status: "completed" } : null));
          setPhase("");
          sessionStorage.removeItem("reelform-active-job");
          return;
        }
        if (["failed", "nsfw", "canceled"].includes(data.status)) {
          setError(
            data.error ||
              "The transformation could not complete. Try a different clip or a simpler prompt.",
          );
          setJob((prev) => (prev ? { ...prev, status: data.status } : null));
          setPhase("");
          sessionStorage.removeItem("reelform-active-job");
          return;
        }
        if (data.status === "unknown") {
          setError(
            data.error ||
              "This request needs review. Do not resubmit; contact support with your generation ID.",
          );
          setPollStopped(true);
          setPhase("");
          return;
        }
        setPhase(
          data.status === "queued"
            ? "Your video is in the queue"
            : "Reimagining your reality",
        );
      } catch (e) {
        if (disposed) return;
        errors++;
        if (errors >= 3) {
          setError(
            e instanceof Error ? e.message : "Unable to check your generation.",
          );
          setPollStopped(true);
          setPhase("");
          return;
        }
      }
      tries++;
      if (tries >= 150) {
        setPollStopped(true);
        setPhase("");
        return;
      }
      timer = setTimeout(poll, Math.min(5000 + tries * 500, 15000));
    }
    poll();
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [jobToken, jobFinished, pollAttempt]);
  function media(file: File) {
    const url = URL.createObjectURL(file);
    assets.current.add(url);
    return { file, url };
  }
  function release(item: Media) {
    URL.revokeObjectURL(item.url);
    assets.current.delete(item.url);
  }
  async function chooseVideo(file?: File) {
    if (!file) return;
    setError("");
    if (file.type !== "video/mp4") {
      setError(
        "Please choose an MP4 video. Convert MOV or WebM footage to MP4 first.",
      );
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      setError("Your video must be 100 MB or smaller.");
      return;
    }
    const item = media(file);
    const metadata = await new Promise<number>((resolve) => {
      const el = document.createElement("video");
      el.preload = "metadata";
      el.onloadedmetadata = () => {
        resolve(el.duration);
        el.removeAttribute("src");
        el.load();
      };
      el.onerror = () => resolve(0);
      el.src = item.url;
    });
    if (
      !metadata ||
      !Number.isFinite(metadata) ||
      metadata < MIN_VIDEO_SECONDS ||
      metadata > MAX_VIDEO_SECONDS
    ) {
      release(item);
      setError("Please use a readable video between 4 and 30 seconds long.");
      return;
    }
    if (video) release(video);
    setVideo({ ...item, duration: metadata });
    setQuote(null);
  }
  function chooseImages(files: FileList | null) {
    if (!files) return;
    setError("");
    const list = Array.from(files);
    if (images.length + list.length > 4) {
      setError("You can add up to four reference photos.");
      return;
    }
    if (
      list.some(
        (file) =>
          !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
          file.size > 10 * 1024 * 1024,
      )
    ) {
      setError("Use JPG, PNG, or WebP images, up to 10 MB each.");
      return;
    }
    setImages((prev) => [...prev, ...list.map(media)]);
  }
  async function generate() {
    if (submitLock.current) return;
    setError("");
    if (!video) {
      setError("Upload your original video first.");
      return;
    }
    if (prompt.trim().length < 10) {
      setError("Describe your transformation in at least 10 characters.");
      return;
    }
    if (!consent) {
      setError(
        "Please confirm that you have permission to use this footage and these photos.",
      );
      return;
    }
    if (!ready) {
      setError(
        "Generation is not connected yet. Add the Higgsfield API credentials to start creating.",
      );
      return;
    }
    if (!authenticated) {
      window.location.assign("/login");
      return;
    }
    submitLock.current = true;
    setResult("");
    setExample(false);
    setPhase("Uploading your original video");
    try {
      if (!quote) {
        const videoToken = await upload(video);
        setPhase("Verifying your video and calculating credits");
        const result = await jsonRequest<{
          quoteToken: string;
          credits: number;
          duration: number;
        }>("/api/quote", { videoToken, resolution });
        setQuote({ ...result, videoToken, requestId: crypto.randomUUID() });
        setPhase("");
        return;
      }
      const videoToken = quote.videoToken;
      setPhase(
        images.length
          ? "Uploading your reference photos"
          : "Preparing your transformation",
      );
      const imageTokens = await Promise.all(images.map(upload));
      setPhase("Sending your transformation to Higgsfield");
      const data = await jsonRequest<{
        token: string;
        requestId: string;
        status: string;
        balance: number;
        error?: string;
      }>("/api/generate", {
        videoToken,
        quoteToken: quote.quoteToken,
        requestId: quote.requestId,
        imageTokens,
        prompt,
        resolution,
        generateAudio: audio,
        consent,
      });
      const active = { ...data, started: Date.now() };
      setJob(active);
      setQuote(null);
      setCreditBalance(data.balance);
      if (data.status === "failed") {
        setError(
          data.error ||
            "The video could not start. Your credits were returned.",
        );
        setPhase("");
        sessionStorage.removeItem("reelform-active-job");
        return;
      }
      try {
        sessionStorage.setItem("reelform-active-job", JSON.stringify(active));
      } catch {}
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "The transformation could not be started.",
      );
      setPhase("");
    } finally {
      submitLock.current = false;
    }
  }
  const jobActive =
    !!job && !["completed", "failed", "nsfw", "canceled"].includes(job.status);
  const busy = !!phase || jobActive;
  function showExample() {
    setExample(true);
    setResult(activeScene.video);
  }
  return (
    <div className="studio-page">
      <a className="skip-link" href="#studio-main">
        Skip to studio
      </a>
      <header className="studio-header">
        <Brand />
        <div className="studio-header-right">
          <Link className="text-link" href="/account?tab=credits">
            <Sparkles size={14} />
            {creditBalance === null
              ? "My account"
              : `${creditBalance.toLocaleString()} credits`}
          </Link>
          <Link className="text-link" href="/">
            <ArrowLeft size={15} /> Back to explore
          </Link>
        </div>
      </header>
      <main id="studio-main" className="studio-shell">
        <div className="studio-title">
          <div>
            <h1>Let’s reimagine your reality.</h1>
            <p>You bring the footage. Your imagination does the rest.</p>
          </div>
          <span className="studio-label">
            <Sparkles size={13} /> Powered by Higgsfield
          </span>
        </div>
        {!authenticated && (
          <div className="connection-note">
            <Info size={17} />
            <p>
              <Link href="/login">Sign in to Reelform</Link> to generate your
              own transformations.
            </p>
          </div>
        )}
        {ready === false && (
          <div className="connection-note">
            <Info size={17} />
            <p>
              Explore the studio and preview an example. Video generation is
              being connected. Explore the examples while we finish setup.
            </p>
            <button
              onClick={configCheck}
              className="icon-button"
              aria-label="Check connection again"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        )}
        <div className="studio-grid">
          <section
            className="studio-panel"
            aria-label="Transformation settings"
          >
            <div className="field-header">
              <h2>Your original video</h2>
              <span>{MIN_VIDEO_SECONDS}–{MAX_VIDEO_SECONDS} sec · MP4</span>
            </div>
            {video ? (
              <div className="selected-video">
                <video src={video.url} muted playsInline controls />
                <div className="file-info">
                  <strong>{video.file.name}</strong>
                  <small>{video.duration.toFixed(1)} sec · {(video.file.size / 1024 / 1024).toFixed(1)} MB</small>
                </div>
                <button
                  disabled={busy}
                  onClick={() => {
                    release(video);
                    setVideo(null);
                    setQuote(null);
                  }}
                  className="icon-button"
                  aria-label="Remove original video"
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <div
                className={`upload-area ${dragging ? "dragging" : ""}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  if (!busy) chooseVideo(e.dataTransfer.files[0]);
                }}
              >
                <input
                  id="video-upload"
                  type="file"
                  accept="video/mp4"
                  disabled={busy}
                  onChange={(e) => chooseVideo(e.target.files?.[0])}
                  aria-label="Upload your original video"
                />
                <label htmlFor="video-upload">
                  <Upload size={24} />
                  <strong>Drop your video here, or browse</strong>
                  <small>
                    Transform clips up to 30 seconds long. MP4 · up to 100 MB.
                  </small>
                </label>
              </div>
            )}
            <div className="field-header">
              <h2>Reference photos</h2>
              <span>{images.length}/4 · Optional</span>
            </div>
            <div className="reference-grid">
              {images.map((item, i) => (
                <div className="reference-image" key={item.url}>
                  <img
                    src={item.url}
                    alt={`Reference ${i + 1}: ${item.file.name}`}
                  />
                  <button
                    disabled={busy}
                    onClick={() => {
                      release(item);
                      setImages((prev) => prev.filter((v) => v !== item));
                    }}
                    aria-label={`Remove reference ${i + 1}`}
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
              {images.length < 4 && (
                <label className="reference-add">
                  <ImagePlus size={22} />
                  <span>Add photos</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    disabled={busy}
                    onChange={(e) => {
                      chooseImages(e.target.files);
                      e.target.value = "";
                    }}
                    aria-label="Add reference photos"
                  />
                </label>
              )}
              {Array.from(
                { length: Math.max(0, 3 - images.length) },
                (_, i) => (
                  <div className="reference-empty" aria-hidden="true" key={i}>
                    <Plus size={16} />
                  </div>
                ),
              )}
            </div>
            <div className="field-header">
              <label htmlFor="prompt">Describe your new reality</label>
              <span>{prompt.length}/2000</span>
            </div>
            <textarea
              id="prompt"
              className="prompt-input"
              maxLength={2000}
              value={prompt}
              disabled={busy}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Put me in a tailored suit, swap my car for a Lamborghini SVJ, and take me to Beverly Hills. Keep my face and natural movement."
            />
            <div className="preset-chips">
              {scenes.map((scene) => (
                <button
                  key={scene.id}
                  disabled={busy}
                  onClick={() => {
                    setPrompt(scene.prompt);
                    setActiveScene(scene);
                    if (example) setResult(scene.video);
                  }}
                >
                  {scene.shortLabel}{" "}
                  <ArrowUpRight
                    size={10}
                    style={{ display: "inline", marginLeft: 2 }}
                  />
                </button>
              ))}
            </div>
            <div className="studio-options">
              <label>
                Output quality
                <AppSelect
                  label="Output quality"
                  value={resolution}
                  disabled={busy}
                  onValueChange={(value) => {
                    setResolution(value);
                    setQuote(null);
                  }}
                  options={[{ value: "720p", label: "720p HD" }, { value: "480p", label: "480p" }]}
                />
              </label>
              <label>
                Sound
                <AppSelect
                  label="Sound"
                  value={audio ? "yes" : "no"}
                  disabled={busy}
                  onValueChange={(value) => setAudio(value === "yes")}
                  options={[{ value: "no", label: "Silent video" }, { value: "yes", label: "Generate audio" }]}
                />
              </label>
            </div>
            <p className="clip-length-note">Longer clips use more credits. Try a short clip first to check your look. You’ll see the full credit cost before you generate.</p>
            <label className="consent">
              <input
                type="checkbox"
                checked={consent}
                disabled={busy}
                onChange={(e) => setConsent(e.target.checked)}
              />
              <span>
                I have permission to use this footage and these photos.
              </span>
            </label>
            {error && (
              <div className="error-message" role="alert">
                {error}
              </div>
            )}
            {quote && (
              <div className="connection-note">
                <Sparkles size={17} />
                <p>
                  <strong>{quote.credits.toLocaleString()} credits</strong> for
                  your {quote.duration}-second transformation. Failed generations return your credits.
                  {creditBalance !== null && creditBalance < quote.credits && (
                    <>
                      {" "}
                      <Link href="/account?tab=credits">Add credits</Link> to
                      continue.
                    </>
                  )}
                </p>
              </div>
            )}
            <button
              onClick={generate}
              disabled={busy || ready === null}
              className="button generate-button"
            >
              <WandSparkles size={18} />
              {busy
                ? quote
                  ? "Creating your new reality…"
                  : "Preparing your video…"
                : quote
                  ? `Generate · ${quote.credits.toLocaleString()} credits`
                  : "Get my credit quote"}
              {!busy && <ArrowUpRight size={17} />}
            </button>
            <p className="generate-note">
              The original clip guides the motion and length.
              <br />
              See your exact credit cost before you generate.
            </p>
          </section>
          <section className="studio-panel" aria-label="Video preview">
            <div className="preview-heading">
              <h2>Your new reality</h2>
              <span>
                {example
                  ? "Higgsfield concept demo"
                  : result
                    ? "Transformation complete"
                    : "The possibility starts here"}
              </span>
            </div>
            <div className="output-preview" aria-live="polite">
              {busy ? (
                <div className="output-empty">
                  <Sparkles size={38} />
                  <h3>{phase || "Your video is still processing"}</h3>
                  <div className="progress-track" />
                  <p>
                    {pollStopped
                      ? "Your generation continues at Higgsfield. Check again to retrieve its latest status."
                      : "Great scenes take a little time. Your footage is being transformed by Higgsfield."}
                  </p>
                  {pollStopped && (
                    <button
                      className="button button-outline"
                      onClick={() => {
                        setError("");
                        setPollAttempt((n) => n + 1);
                      }}
                    >
                      Check generation <RefreshCw size={14} />
                    </button>
                  )}
                </div>
              ) : result ? (
                <video
                  key={result}
                  src={result}
                  controls
                  autoPlay
                  muted
                  playsInline
                  loop={example}
                />
              ) : (
                <div className="output-empty">
                  <Film size={37} strokeWidth={1.2} />
                  <h3>Same you. A whole new scene.</h3>
                  <p>
                    Your transformation will appear here. Curious about the
                    possibilities?
                  </p>
                  <button
                    className="button button-outline"
                    onClick={showExample}
                  >
                    <Play size={13} fill="currentColor" /> Preview an example
                  </button>
                </div>
              )}
            </div>
            {result && !busy && (
              <div className="download-row">
                <a
                  className="button"
                  href={result}
                  download={
                    example
                      ? "reelform-example.mp4"
                      : "reelform-transformation.mp4"
                  }
                  target="_blank"
                  rel="noreferrer"
                >
                  <Download size={16} />
                  {example ? "Download example" : "Download video"}
                </a>
                <button
                  className="button button-outline"
                  onClick={() => {
                    setResult("");
                    setExample(false);
                    setJob(null);
                  }}
                >
                  Clear preview
                </button>
              </div>
            )}
            {example && !busy && (
              <p className="example-note">
                An original AI-generated scene made with Higgsfield. This is a
                concept demo, not a transformation of your uploaded footage.
              </p>
            )}
            <div className="preview-notes">
              <span>
                <ShieldCheck size={13} /> Your footage, your choice
              </span>
              <span>
                <Check size={13} /> MP4 download
              </span>
            </div>
            {jobActive && (
              <div className="status-box">
                <p>
                  Keep this tab open. If you refresh, this browser tab can
                  resume checking your generation.
                </p>
                <small>Request: {job?.requestId}</small>
              </div>
            )}
          </section>
        </div>
      </main>
      <footer className="studio-footer">
        Made for your imagination. Powered by Higgsfield.
      </footer>
    </div>
  );
}
