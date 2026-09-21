"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  ArrowUpRight,
  AudioLines,
  Check,
  ChevronDown,
  Download,
  Film,
  ImagePlus,
  Info,
  Menu,
  Plus,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Upload,
  Users,
  X,
} from "lucide-react";
import Brand from "./brand";
import AppSelect from "./app-select";
import GenerationProgress from "./generation-progress";
import { useStudioChat, type ChatMessage } from "./use-studio-chat";
import { VIDEO_MODELS } from "@/lib/video-models";
import { VIDEO_ACCEPT, MAX_VIDEO_SIZE_LABEL } from "@/lib/video-limits";
import { scenes } from "@/lib/scenes";
import "./studio-chat.css";

function SentMessage({ message }: { message: ChatMessage }) {
  return (
    <div className="chat-user-message">
      <span className="chat-speaker">You</span>
      <div className="chat-user-bubble">
        {(message.videoUrl || message.images.length > 0) && (
          <div className="chat-sent-attachments">
            {message.videoUrl && (
              <div className="chat-sent-video">
                <video
                  src={message.videoUrl}
                  muted
                  playsInline
                  preload="metadata"
                  aria-label={`Original video: ${message.videoName}`}
                />
                <span>
                  <Film size={12} /> Original video
                </span>
              </div>
            )}
            {message.images.map((image, index) => (
              <div className="chat-sent-image" key={image.url}>
                {/* Local blob previews cannot use the image optimization server. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image.url}
                  alt={`Reference ${index + 1}: ${image.name}`}
                />
              </div>
            ))}
          </div>
        )}
        <p>{message.prompt}</p>
        <div className="chat-message-meta">
          <span>{message.modelName}</span>
          <span>{message.resolution}</span>
        </div>
      </div>
    </div>
  );
}
function AssistantMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="chat-assistant-message">
      <div className="chat-assistant-heading">
        <span className="chat-assistant-avatar">
          <AudioLines size={17} />
        </span>
        <strong>Reelform</strong>
      </div>
      <div className="chat-assistant-body">{children}</div>
    </div>
  );
}
function VideoResult({ url }: { url: string }) {
  return (
    <div className="chat-result">
      <p>Your new reality is ready.</p>
      <video
        src={url}
        controls
        playsInline
        preload="metadata"
        aria-label="Generated video"
      />
      <div className="chat-result-actions">
        <a
          href={url.startsWith("/api/videos/") ? `${url}?download=1` : url}
          download="reelform-transformation.mp4"
          target="_blank"
          rel="noreferrer"
        >
          <Download size={15} /> Download video
        </a>
        <Link prefetch={false} href="/account?tab=creations">
          My creations <ArrowUpRight size={14} />
        </Link>
        <Link prefetch={false} href="/community/share">
          Share with the community <ArrowUpRight size={14} />
        </Link>
      </div>
    </div>
  );
}

export default function Studio() {
  const s = useStudioChat();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [fullHdOpen, setFullHdOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const latestTurn = useRef<HTMLDivElement>(null);
  const hasConversation = !!s.currentMessage || s.history.length > 0;
  const insufficient =
    s.quote !== null &&
    s.creditBalance !== null &&
    s.creditBalance < s.quote.credits;
  const canSend =
    !!s.video &&
    !!s.quote &&
    !!s.ready &&
    !!s.authenticated &&
    !s.busy &&
    !s.inspecting &&
    !s.modelError &&
    !insufficient &&
    s.consent &&
    s.prompt.trim().length >= 10;
  useEffect(() => {
    if (s.currentMessage)
      latestTurn.current?.scrollIntoView({
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
        block: "start",
      });
  }, [s.currentMessage]);
  function chooseScene(prompt: string) {
    s.setPrompt(prompt);
    promptRef.current?.focus();
  }
  function reset() {
    s.newChat();
    setMenuOpen(false);
    setSettingsOpen(false);
    promptRef.current?.focus();
  }
  async function drop(files: FileList) {
    if (s.busy) return;
    const list = Array.from(files);
    const videos = list.filter(
      (file) =>
        file.type.startsWith("video/") ||
        /\.(mp4|mov|m4v|webm)$/i.test(file.name),
    );
    if (videos.length > 1) {
      s.setError("Add one original video per message.");
      return;
    }
    const references = list.filter((file) => !videos.includes(file));
    if (references.length && !videos.length && !s.video) {
      s.setError("Add your original video before reference images.");
      return;
    }
    if (videos[0] && !(await s.chooseVideo(videos[0]))) return;
    if (references.length) s.chooseImages(references);
  }
  const priceLabel = s.quote
    ? s.quote.credits === 0
      ? "Free admin generation"
      : `${s.quote.credits.toLocaleString()} credits`
    : s.inspecting
      ? "Checking your clip…"
      : s.video && s.quotePhase
        ? s.quotePhase
        : s.video
          ? "Cost shown when your video is ready"
          : "Credit cost appears after upload";
  return (
    <div className="studio-chat-layout">
      <a className="skip-link" href="#studio-main">
        Skip to studio
      </a>
      <aside
        className={`studio-chat-sidebar ${menuOpen ? "is-open" : ""}`}
        id="studio-navigation"
      >
        <div className="chat-sidebar-brand">
          <Brand />
          <button
            className="chat-mobile-close"
            aria-label="Close studio navigation"
            onClick={() => setMenuOpen(false)}
          >
            <X size={20} />
          </button>
        </div>
        <button className="chat-new-button" onClick={reset} disabled={s.busy}>
          <Plus size={17} /> New video <span aria-hidden="true">↗</span>
        </button>
        <nav aria-label="Studio navigation">
          <Link prefetch={false} href="/studio" aria-current="page">
            <AudioLines size={17} /> Video studio
          </Link>
          <Link prefetch={false} href="/account?tab=creations">
            <Film size={17} /> My creations
          </Link>
          <Link prefetch={false} href="/community">
            <Users size={17} /> Community
          </Link>
        </nav>
        <div className="chat-sidebar-ideas">
          <span>START WITH AN IDEA</span>
          {scenes.slice(0, 4).map((scene) => (
            <button
              key={scene.id}
              disabled={s.busy}
              onClick={() => {
                chooseScene(scene.prompt);
                setMenuOpen(false);
              }}
            >
              <span>{scene.shortLabel}</span>
              <ArrowUpRight size={13} />
            </button>
          ))}
        </div>
        <div className="chat-sidebar-bottom">
          <div className="chat-creator-note">
            <ShieldCheck size={19} />
            <strong>
              Your imagination.
              <br />
              Your creation.
            </strong>
            <p>
              Your videos stay private.
              <br />
              You keep the rights.
            </p>
          </div>
          <Link prefetch={false} href="/account" className="chat-account-link">
            <span className="chat-account-avatar">
              <Users size={17} />
            </span>
            <span>
              My account<small>Plans, credits & settings</small>
            </span>
            <ArrowUpRight size={14} />
          </Link>
          <Link prefetch={false} href="/" className="chat-back-home">
            Back to Reelform
          </Link>
        </div>
      </aside>
      {menuOpen && (
        <button
          className="chat-nav-backdrop"
          onClick={() => setMenuOpen(false)}
          aria-label="Close navigation"
        />
      )}
      <main
        id="studio-main"
        className={`studio-chat-main ${hasConversation ? "has-conversation" : "is-empty"}`}
      >
        <header className="studio-chat-header">
          <div>
            <button
              className="chat-mobile-menu"
              aria-label="Open studio navigation"
              aria-expanded={menuOpen}
              aria-controls="studio-navigation"
              onClick={() => setMenuOpen(true)}
            >
              <Menu size={21} />
            </button>
            <span>Video studio</span>
            <span className="chat-header-separator">/</span>
            <small>
              {hasConversation ? "Your conversation" : "New creation"}
            </small>
          </div>
          <Link
            prefetch={false}
            className="chat-credit-balance"
            href="/account?tab=credits"
          >
            <Sparkles size={14} />
            {s.isAdmin
              ? "Admin access"
              : s.creditBalance === null
                ? "My credits"
                : `${s.creditBalance.toLocaleString()} credits`}
            <Plus size={13} />
          </Link>
        </header>
        <div
          className="studio-conversation"
          aria-label="Video creation conversation"
        >
          {!hasConversation && (
            <section className="chat-welcome">
              <span className="chat-welcome-icon">
                <AudioLines size={30} strokeWidth={1.7} />
              </span>
              <span className="chat-eyebrow">YOUR IMAGINATION, IN MOTION</span>
              <h1>
                What’s your next <span>reality?</span>
              </h1>
              <p>
                Start with your video. Add a little inspiration.
                <br />
                Tell us what you want to change.
              </p>
            </section>
          )}
          {hasConversation && (
            <h1 className="sr-only">Your video creation conversation</h1>
          )}
          {s.history.map((message) => (
            <section className="chat-turn" key={message.id}>
              <SentMessage message={message} />
              <AssistantMessage>
                {message.result ? (
                  <VideoResult url={message.result} />
                ) : (
                  <p className="chat-generation-error">
                    {message.error || "This generation did not complete."}
                  </p>
                )}
              </AssistantMessage>
            </section>
          ))}
          {s.currentMessage && (
            <section className="chat-turn" ref={latestTurn}>
              <SentMessage message={s.currentMessage} />
              <AssistantMessage>
                {s.result ? (
                  <VideoResult url={s.result} />
                ) : (
                  <div className="chat-generation-state">
                    <div className="chat-generation-title">
                      {s.busy && !s.pollStopped && !s.pending && (
                        <span className="chat-working-mark" aria-hidden="true">
                          <Sparkles size={19} />
                        </span>
                      )}
                      <p role="status">
                        {s.phase ||
                          (s.pending
                            ? "Let’s check that last request."
                            : s.pollStopped
                              ? "Your video is still being checked."
                              : s.generationError
                                ? "This generation needs your attention."
                                : "Preparing your video…")}
                      </p>
                    </div>
                    {s.jobActive && s.job && (
                      <GenerationProgress
                        started={s.job.started}
                        status={s.job.status}
                        paused={s.pollStopped}
                      />
                    )}
                    {s.phase && !s.jobActive && (
                      <div
                        className="chat-preparing-line"
                        role="progressbar"
                        aria-label={s.phase}
                      />
                    )}
                    {s.generationError && (
                      <p className="chat-generation-error" role="alert">
                        {s.generationError}
                      </p>
                    )}
                    {s.pending && !s.phase && (
                      <div className="chat-recovery">
                        <p>
                          The connection was interrupted. Checking this request
                          reuses the original send so it won’t create a second
                          charge.
                        </p>
                        <button onClick={() => void s.recoverSend()}>
                          <RefreshCw size={15} /> Check request
                        </button>
                        <Link prefetch={false} href="/account?tab=creations">
                          Check My creations
                        </Link>
                      </div>
                    )}
                    {s.pollStopped && !s.pending && (
                      <button
                        className="chat-inline-button"
                        onClick={s.checkGeneration}
                      >
                        <RefreshCw size={15} /> Check generation
                      </button>
                    )}
                    {s.job && (
                      <details className="chat-job-details">
                        <summary>Generation details</summary>
                        <p>
                          Generation ID: <code>{s.job.requestId}</code>
                        </p>
                        <Link prefetch={false} href="/account?tab=creations">
                          View in My creations
                        </Link>
                      </details>
                    )}
                  </div>
                )}
              </AssistantMessage>
            </section>
          )}
        </div>
        <div className="studio-composer-area">
          <div className="studio-composer-wrap">
            {s.authenticated === false && (
              <div className="chat-notice">
                <Info size={16} />
                <p>
                  <Link prefetch={false} href="/login?next=%2Fstudio">
                    Sign in
                  </Link>{" "}
                  to upload your files and generate a video.
                </p>
              </div>
            )}
            {s.ready === false && (
              <div className="chat-notice">
                <Info size={16} />
                <p>
                  Video generation is currently unavailable. You can still put
                  your idea together.
                </p>
                <button
                  onClick={s.configCheck}
                  aria-label="Check generation connection"
                >
                  <RefreshCw size={15} />
                </button>
              </div>
            )}
            <form
              className={`studio-chat-composer ${dragging ? "is-dragging" : ""}`}
              onSubmit={(e) => {
                e.preventDefault();
                void s.generate();
              }}
              onDragEnter={(e) => {
                e.preventDefault();
                if (!s.busy) {
                  dragDepth.current++;
                  setDragging(true);
                }
              }}
              onDragOver={(e) => e.preventDefault()}
              onDragLeave={(e) => {
                e.preventDefault();
                if (--dragDepth.current <= 0) {
                  dragDepth.current = 0;
                  setDragging(false);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                dragDepth.current = 0;
                setDragging(false);
                void drop(e.dataTransfer.files);
              }}
            >
              {dragging && (
                <div className="chat-drop-overlay">
                  <Upload size={25} />
                  <strong>Drop your video or reference images</strong>
                </div>
              )}
              <div className="chat-attachment-bar">
                <input
                  ref={videoInput}
                  id="studio-video-input"
                  type="file"
                  accept={VIDEO_ACCEPT}
                  className="sr-only"
                  disabled={s.busy}
                  aria-label="Upload original video"
                  onChange={(e) => {
                    void s.chooseVideo(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
                <input
                  ref={imageInput}
                  id="studio-reference-input"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  className="sr-only"
                  disabled={s.busy || !s.video}
                  aria-label="Upload reference images"
                  onChange={(e) => {
                    if (e.target.files) s.chooseImages(e.target.files);
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  className={`chat-attach-button ${s.video ? "has-file" : ""}`}
                  onClick={() => videoInput.current?.click()}
                  disabled={s.busy || s.inspecting}
                >
                  <span className="chat-step">
                    {s.video ? <Check size={12} /> : "1"}
                  </span>
                  <Film size={16} />
                  {s.inspecting
                    ? "Checking video…"
                    : s.video
                      ? "Replace video"
                      : "Upload video"}
                </button>
                <button
                  type="button"
                  className={`chat-attach-button ${s.images.length ? "has-file" : ""}`}
                  onClick={() => imageInput.current?.click()}
                  disabled={
                    s.busy ||
                    !s.video ||
                    s.images.length >= s.selectedModel.maxImages
                  }
                >
                  <span className="chat-step">
                    {s.images.length ? <Check size={12} /> : "2"}
                  </span>
                  <ImagePlus size={16} />
                  Reference images
                  {s.images.length > 0 && (
                    <span className="chat-attachment-count">
                      {s.images.length}/{s.selectedModel.maxImages}
                    </span>
                  )}
                </button>
                <span className="chat-attachment-hint">
                  {s.selectedModel.minImages
                    ? `${s.selectedModel.minImages} reference required`
                    : "References optional"}
                </span>
              </div>
              {(s.video || s.images.length > 0) && (
                <div className="chat-attachment-previews">
                  {s.video && (
                    <div className="chat-video-attachment">
                      <video
                        src={s.video.url}
                        controls
                        muted
                        playsInline
                        preload="metadata"
                        aria-label="Original video preview"
                      />
                      <div>
                        <strong>{s.video.file.name}</strong>
                        <span>
                          {s.video.duration === null
                            ? "Duration checked on upload"
                            : `${s.video.duration.toFixed(1)} sec`}{" "}
                          · {(s.video.file.size / 1024 / 1024).toFixed(1)} MB
                        </span>
                      </div>
                      <button
                        type="button"
                        disabled={s.busy}
                        onClick={s.removeVideo}
                        aria-label="Remove original video"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  )}
                  {s.images.map((image, i) => (
                    <div className="chat-image-attachment" key={image.url}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={image.url}
                        alt={`Reference ${i + 1}: ${image.file.name}`}
                      />
                      <span>Ref {i + 1}</span>
                      <button
                        type="button"
                        disabled={s.busy}
                        aria-label={`Remove reference ${i + 1}`}
                        onClick={() => s.removeImage(image)}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <label className="sr-only" htmlFor="studio-prompt">
                Describe your video transformation
              </label>
              <textarea
                id="studio-prompt"
                ref={promptRef}
                value={s.prompt}
                disabled={s.busy}
                maxLength={2000}
                rows={3}
                onChange={(e) => s.setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    (e.metaKey || e.ctrlKey) &&
                    !e.nativeEvent.isComposing
                  ) {
                    e.preventDefault();
                    if (canSend) void s.generate();
                  }
                }}
                placeholder="Describe your new reality. A different outfit, a new place, a whole new scene…"
                aria-describedby="studio-file-help"
              />
              <div className="chat-composer-toolbar">
                <div className="chat-model-summary">
                  <button
                    type="button"
                    className="chat-settings-toggle"
                    aria-expanded={settingsOpen}
                    aria-controls="studio-generation-settings"
                    onClick={() => setSettingsOpen(!settingsOpen)}
                    disabled={s.busy}
                  >
                    <SlidersHorizontal size={15} />
                    <span>{s.selectedModel.name}</span>
                    <ChevronDown size={13} />
                  </button>
                  <span className="chat-quality-label">
                    {s.resolution}
                    {s.audio ? " · Sound on" : ""}
                  </span>
                </div>
                <div className="chat-send-controls">
                  <span className="chat-prompt-count">
                    {s.prompt.length}/2000
                  </span>
                  <button
                    className="chat-send-button"
                    type="submit"
                    aria-label="Send and generate video"
                    disabled={!canSend}
                  >
                    <span>{s.busy ? "Generating" : "Send"}</span>
                    <ArrowUp size={19} />
                  </button>
                </div>
              </div>
              {settingsOpen && (
                <div
                  id="studio-generation-settings"
                  className="chat-settings-panel"
                >
                  <div className="chat-settings-title">
                    <strong>Generation settings</strong>
                    <button
                      type="button"
                      onClick={() => setSettingsOpen(false)}
                      aria-label="Close generation settings"
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <div className="chat-settings-grid">
                    <label>
                      AI model
                      <AppSelect
                        label="AI model"
                        value={s.model}
                        disabled={s.busy}
                        onValueChange={(value) => {
                          s.changeModel(value);
                          setFullHdOpen(false);
                        }}
                        options={VIDEO_MODELS.map((m, i) => ({
                          value: m.id,
                          label: `${m.name}${i === 0 ? " · Recommended" : ""}`,
                        }))}
                      />
                    </label>
                    <label>
                      Quality
                      <AppSelect
                        label="Output quality"
                        value={s.resolution}
                        disabled={s.busy}
                        onValueChange={(value) => {
                          if (value === "choose-1080p") {
                            setFullHdOpen(true);
                            return;
                          }
                          setFullHdOpen(false);
                          s.setResolution(value);
                        }}
                        options={[
                          ...s.selectedModel.resolutions.map((value) => ({
                            value,
                            label:
                              value === "1080p"
                                ? "1080p Full HD"
                                : value === "720p"
                                  ? "720p HD"
                                  : "480p",
                          })),
                          ...(!s.selectedModel.resolutions.includes("1080p")
                            ? [
                                {
                                  value: "choose-1080p",
                                  label: "1080p · Change model",
                                },
                              ]
                            : []),
                        ]}
                      />
                    </label>
                    <label>
                      Sound
                      <AppSelect
                        label="Sound"
                        value={s.audio ? "yes" : "no"}
                        disabled={s.busy}
                        onValueChange={(value) => s.setAudio(value === "yes")}
                        options={
                          s.selectedModel.audio
                            ? [
                                { value: "no", label: "Silent video" },
                                { value: "yes", label: "Generate audio" },
                              ]
                            : [{ value: "no", label: "Silent video" }]
                        }
                      />
                    </label>
                  </div>
                  <p>{s.selectedModel.description}</p>
                  {fullHdOpen && (
                    <div className="chat-fullhd-models">
                      <strong>Choose a model for Full HD</strong>
                      {VIDEO_MODELS.filter((m) =>
                        m.resolutions.includes("1080p"),
                      ).map((m) => (
                        <button
                          type="button"
                          key={m.id}
                          disabled={
                            s.busy ||
                            (s.video?.duration != null &&
                              s.video.duration > m.maxSeconds)
                          }
                          onClick={() => {
                            s.changeModel(m.id, "1080p");
                            setFullHdOpen(false);
                          }}
                        >
                          <span>{m.name}</span>
                          <small>
                            Up to {m.maxSeconds}s ·{" "}
                            {m.minImages
                              ? `${m.minImages} reference required`
                              : "References optional"}
                          </small>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </form>
            <div className="chat-composer-details">
              <p id="studio-file-help">
                {s.video
                  ? `JPG, PNG or WebP references · up to 10 MB each`
                  : `4–30 sec video · MP4, MOV, M4V or WebM · up to ${MAX_VIDEO_SIZE_LABEL}`}
              </p>
              <span>⌘ / Ctrl + Enter to send</span>
            </div>
            {s.video && (
              <div className="chat-send-consent">
                <label>
                  <input
                    type="checkbox"
                    checked={s.consent}
                    disabled={s.busy}
                    onChange={(e) => s.setConsent(e.target.checked)}
                  />
                  <span>
                    I have permission to use this footage and these images.
                  </span>
                </label>
                <div className="chat-credit-cost" role="status">
                  <Sparkles size={13} />
                  <span>{priceLabel}</span>
                </div>
              </div>
            )}
            {s.video && !s.busy && (
              <p className="chat-credit-explanation">
                {s.isAdmin
                  ? "No Reelform credits charged. Provider usage is billed to your Higgsfield account."
                  : "Credits are used when you press Send. Failed generations return your credits."}
              </p>
            )}
            {s.modelError && (
              <p className="chat-composer-error" role="alert">
                {s.modelError}
              </p>
            )}
            {s.quoteError && !s.busy && (
              <div className="chat-composer-error" role="alert">
                <p>{s.quoteError}</p>
                <button onClick={s.retryQuote}>
                  <RefreshCw size={14} /> Retry upload check
                </button>
              </div>
            )}
            {s.error && (
              <p className="chat-composer-error" role="alert">
                {s.error}
              </p>
            )}
            {insufficient && (
              <p className="chat-composer-error">
                You need more credits for this video.{" "}
                <Link prefetch={false} href="/account?tab=credits">
                  Add credits
                </Link>
              </p>
            )}
            {!hasConversation && !s.video && (
              <div className="chat-starter-prompts">
                <span>A LITTLE INSPIRATION</span>
                <div>
                  {[scenes[0], scenes[1], scenes[4]].map((scene) => (
                    <button
                      key={scene.id}
                      disabled={s.busy}
                      onClick={() => chooseScene(scene.prompt)}
                    >
                      <span>{scene.shortLabel}</span>
                      <ArrowUpRight size={13} />
                    </button>
                  ))}
                </div>
              </div>
            )}
            <p className="chat-footer-note">
              <ShieldCheck size={12} /> Your videos stay private. Your creations
              stay yours.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
