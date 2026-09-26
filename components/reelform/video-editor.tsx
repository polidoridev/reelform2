"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Download,
  Maximize2,
  Minus,
  Pause,
  Play,
  Plus,
  Redo2,
  Scissors,
  Trash2,
  Undo2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import {
  clipLength,
  clipOffsets,
  createEdit,
  editDuration,
  isUnchanged,
  locate,
  moveClip,
  removeClip,
  splitAt,
  trimClip,
  type Edit,
} from "@/lib/video-edit";
import { MIN_VIDEO_SECONDS } from "@/lib/video-limits";
import "./video-editor.css";

export type EditorSource = {
  file: File;
  duration: number;
  edit?: Edit;
  notice?: string;
  origin: "upload" | "result";
};
type Props = EditorSource & {
  maxSeconds: number;
  modelLimit?: { name: string; seconds: number };
  onApply: (file: File, edit: Edit) => void;
  onClose: () => void;
};

const THUMB_HEIGHT = 56;
const TRACK_INSET = 12;
const format = (seconds: number) => {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  return `${minutes}:${(safe - minutes * 60).toFixed(1).padStart(4, "0")}`;
};
const editKey = (edit: Edit) => JSON.stringify([edit.muted, edit.clips.map((c) => [c.start, c.end])]);

export default function VideoEditor({ file, duration, edit: initial, notice, origin, maxSeconds, modelLimit, onApply, onClose }: Props) {
  const [edit, setEdit] = useState<Edit>(() => initial ?? createEdit(duration));
  const [past, setPast] = useState<Edit[]>([]);
  const [future, setFuture] = useState<Edit[]>([]);
  const [selected, setSelected] = useState(() => edit.clips[0]?.id ?? "");
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [zoom, setZoom] = useState(0);
  const [aspect, setAspect] = useState(16 / 9);
  const [thumbs, setThumbs] = useState<{ step: number; urls: (string | null)[] }>({ step: 1, urls: [] });
  const [rendering, setRendering] = useState<{ progress: number; action: "apply" | "download" } | null>(null);
  const [error, setError] = useState("");
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const editRef = useRef(edit);
  const clipIndex = useRef(0);
  const timeRef = useRef(0);
  const frame = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const rendered = useRef<{ key: string; file: File } | null>(null);
  useLayoutEffect(() => {
    editRef.current = edit;
  }, [edit]);

  const total = editDuration(edit);
  const offsets = clipOffsets(edit);
  const pps = zoom || 40;
  const selectedIndex = edit.clips.findIndex((clip) => clip.id === selected);
  const tooShort = total < MIN_VIDEO_SECONDS;
  const tooLong = total > maxSeconds + 0.01;
  const dirty = !isUnchanged(edit, duration);

  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      opener?.focus?.();
      abort.current?.abort();
      cancelAnimationFrame(frame.current);
    };
  }, []);

  // Fit the whole edit on first layout; later changes keep the chosen zoom so
  // clips don't jump while the person is trimming them.
  const fit = useCallback(() => {
    const width = (timelineRef.current?.clientWidth ?? 600) - 24;
    setZoom(Math.max(2, Math.min(240, width / Math.max(editDuration(editRef.current), 1))));
  }, []);
  useEffect(() => fit(), [fit]);

  useEffect(() => {
    const controller = new AbortController();
    const step = Math.max(duration / 90, 0.5);
    const times = Array.from({ length: Math.max(1, Math.floor(duration / step)) }, (_, i) => i * step + step / 2);
    void import("@/lib/render-edit").then(({ sourceThumbnails }) =>
      sourceThumbnails(file, times, THUMB_HEIGHT * 2, controller.signal).then((urls) => {
        if (!controller.signal.aborted) setThumbs({ step, urls });
        else urls.forEach((u) => u?.startsWith("blob:") && URL.revokeObjectURL(u));
      }),
    );
    return () => controller.abort();
  }, [file, duration]);
  useEffect(() => () => thumbs.urls.forEach((u) => u?.startsWith("blob:") && URL.revokeObjectURL(u)), [thumbs]);

  // The playhead lives in a ref too, so handlers fired in the same tick as a seek see it.
  const showTime = useCallback((value: number) => {
    timeRef.current = value;
    setTime(value);
  }, []);
  const seek = useCallback((target: number) => {
    const current = editRef.current;
    const clamped = Math.min(Math.max(target, 0), editDuration(current));
    const hit = locate(current, clamped);
    if (!hit) return;
    clipIndex.current = hit.index;
    if (videoRef.current) videoRef.current.currentTime = hit.source;
    showTime(clamped);
  }, [showTime]);
  const pause = useCallback(() => {
    videoRef.current?.pause();
    cancelAnimationFrame(frame.current);
    setPlaying(false);
  }, []);
  // Plays clips back-to-back by jumping the source video at each cut. Runs every
  // frame and on timeupdate, which still fires when animation frames are throttled.
  const advance = useCallback(() => {
    const video = videoRef.current;
    const current = editRef.current;
    const clip = current.clips[clipIndex.current];
    if (!video || !clip || video.paused) return false;
    if (video.currentTime >= clip.end - 0.02 || video.ended) {
      if (clipIndex.current + 1 < current.clips.length) {
        clipIndex.current++;
        video.currentTime = current.clips[clipIndex.current].start;
        showTime(clipOffsets(current)[clipIndex.current]);
        return true;
      }
      video.pause();
      setPlaying(false);
      showTime(editDuration(current));
      return false;
    }
    showTime(clipOffsets(current)[clipIndex.current] + Math.max(0, video.currentTime - clip.start));
    return true;
  }, [showTime]);
  const play = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (timeRef.current >= editDuration(editRef.current) - 0.05) seek(0);
    const loop = () => {
      if (advance()) frame.current = requestAnimationFrame(loop);
    };
    void video.play().then(() => {
      setPlaying(true);
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(loop);
    }).catch(() => setPlaying(false));
  }, [advance, seek]);

  function commit(next: Edit, before = edit) {
    if (next === before) return;
    setPast((p) => [...p.slice(-49), before]);
    setFuture([]);
    setEdit(next);
    editRef.current = next;
    seek(Math.min(timeRef.current, editDuration(next)));
  }
  function undo() {
    if (!past.length) return;
    setFuture((f) => [edit, ...f]);
    const previous = past[past.length - 1];
    setPast(past.slice(0, -1));
    setEdit(previous);
    editRef.current = previous;
    seek(Math.min(timeRef.current, editDuration(previous)));
  }
  function redo() {
    if (!future.length) return;
    setPast((p) => [...p, edit]);
    const [next, ...rest] = future;
    setFuture(rest);
    setEdit(next);
    editRef.current = next;
    seek(Math.min(timeRef.current, editDuration(next)));
  }
  function split() {
    pause();
    const next = splitAt(edit, timeRef.current);
    if (next === edit) {
      setError("Move the playhead at least a quarter second away from a cut to split there.");
      return;
    }
    setError("");
    const hit = locate(next, timeRef.current);
    commit(next);
    if (hit) setSelected(hit.clip.id);
  }
  function remove() {
    if (selectedIndex < 0) return;
    if (edit.clips.length < 2) {
      setError("Split the video first, then delete the part you don’t want. Or drag the edges to trim.");
      return;
    }
    pause();
    setError("");
    const next = removeClip(edit, selected);
    commit(next);
    setSelected(next.clips[Math.min(selectedIndex, next.clips.length - 1)].id);
  }
  function move(direction: -1 | 1) {
    pause();
    commit(moveClip(edit, selected, direction));
  }

  // Trimming: one undo step per drag, live preview of the edge frame.
  function startTrim(event: React.PointerEvent, id: string, edge: "start" | "end") {
    event.preventDefault();
    event.stopPropagation();
    pause();
    setSelected(id);
    const before = edit;
    const clip = before.clips.find((c) => c.id === id)!;
    const origin = event.clientX;
    const from = edge === "start" ? clip.start : clip.end;
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);
    let latest = before;
    const moveTo = (e: PointerEvent) => {
      latest = trimClip(before, id, edge, from + (e.clientX - origin) / pps, duration);
      setEdit(latest);
      editRef.current = latest;
      const trimmed = latest.clips.find((c) => c.id === id)!;
      const index = latest.clips.indexOf(trimmed);
      const at = edge === "start" ? trimmed.start : trimmed.end - 0.001;
      clipIndex.current = index;
      if (videoRef.current) videoRef.current.currentTime = at;
      showTime(clipOffsets(latest)[index] + at - trimmed.start);
    };
    const end = () => {
      target.removeEventListener("pointermove", moveTo);
      target.removeEventListener("pointerup", end);
      target.removeEventListener("pointercancel", end);
      if (latest !== before) {
        setPast((p) => [...p.slice(-49), before]);
        setFuture([]);
      }
    };
    target.addEventListener("pointermove", moveTo);
    target.addEventListener("pointerup", end);
    target.addEventListener("pointercancel", end);
  }
  function trimByKey(event: React.KeyboardEvent, id: string, edge: "start" | "end") {
    const delta = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
    if (!delta) return;
    event.preventDefault();
    event.stopPropagation();
    const clip = edit.clips.find((c) => c.id === id)!;
    const step = event.shiftKey ? 1 : 0.1;
    commit(trimClip(edit, id, edge, (edge === "start" ? clip.start : clip.end) + delta * step, duration));
  }
  // Scrubbing on the timeline seeks and selects the clip under the pointer.
  function startScrub(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const track = event.currentTarget;
    const at = (x: number) => (x - track.getBoundingClientRect().left - TRACK_INSET) / pps;
    pause();
    track.setPointerCapture(event.pointerId);
    const go = (x: number) => {
      const t = at(x);
      seek(t);
      const hit = locate(editRef.current, Math.min(Math.max(t, 0), editDuration(editRef.current)));
      if (hit) setSelected(hit.clip.id);
    };
    go(event.clientX);
    const moveTo = (e: PointerEvent) => go(e.clientX);
    const end = () => {
      track.removeEventListener("pointermove", moveTo);
      track.removeEventListener("pointerup", end);
      track.removeEventListener("pointercancel", end);
    };
    track.addEventListener("pointermove", moveTo);
    track.addEventListener("pointerup", end);
    track.addEventListener("pointercancel", end);
  }

  async function output(action: "apply" | "download") {
    if (rendering) return;
    pause();
    setError("");
    const key = editKey(edit);
    let result: File;
    if (!dirty) result = file;
    else if (rendered.current?.key === key) result = rendered.current.file;
    else {
      const controller = new AbortController();
      abort.current = controller;
      setRendering({ progress: 0, action });
      try {
        const { renderEdit } = await import("@/lib/render-edit");
        result = await renderEdit(file, edit, (progress) => setRendering({ progress, action }), controller.signal);
        rendered.current = { key, file: result };
      } catch (e) {
        if (!controller.signal.aborted) setError((e as Error).message);
        setRendering(null);
        return;
      } finally {
        abort.current = null;
      }
      setRendering(null);
    }
    if (action === "apply") onApply(result, edit);
    else {
      const link = document.createElement("a");
      const href = URL.createObjectURL(result);
      link.href = href;
      link.download = result.name.endsWith(".mp4") || !dirty ? result.name : `${result.name}.mp4`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(href), 60000);
    }
  }
  function close() {
    if (rendering) return;
    if (dirty && past.length && !confirm("Discard your edits?")) return;
    onClose();
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (rendering) return;
    const target = event.target as HTMLElement;
    const typing = target.matches("input, textarea, select, button, [role=slider]");
    const mod = event.metaKey || event.ctrlKey;
    if (event.key === "Escape") { event.preventDefault(); close(); }
    else if (mod && event.key.toLowerCase() === "z") { event.preventDefault(); if (event.shiftKey) redo(); else undo(); }
    else if (mod && event.key.toLowerCase() === "y") { event.preventDefault(); redo(); }
    else if (typing || mod) return;
    else if (event.key === " ") { event.preventDefault(); if (playing) pause(); else play(); }
    else if (event.key.toLowerCase() === "s") { event.preventDefault(); split(); }
    else if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); remove(); }
    else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      pause();
      seek(timeRef.current + (event.key === "ArrowLeft" ? -1 : 1) * (event.shiftKey ? 1 : 1 / 30));
    }
  }

  const thumbWidth = THUMB_HEIGHT * aspect;
  const applyLabel = origin === "result" ? "Use in studio" : "Use this video";
  const status = tooShort
    ? `Keep at least ${MIN_VIDEO_SECONDS} seconds to use it in the studio.`
    : tooLong
      ? `Trim ${format(total - maxSeconds)} more to use it in the studio (up to ${maxSeconds} seconds).`
      : modelLimit && total > modelLimit.seconds
        ? `${modelLimit.name} accepts up to ${modelLimit.seconds} seconds. Trim more or choose another model.`
        : "Ready for the studio.";

  return (
    <div className="video-editor-backdrop">
      <div
        className="video-editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby="video-editor-title"
        tabIndex={-1}
        ref={dialogRef}
        onKeyDown={onKeyDown}
      >
        <header className="editor-header">
          <div>
            <h2 id="video-editor-title">Edit video</h2>
            <span title={file.name}>{file.name}</span>
          </div>
          <button type="button" className="editor-icon-button" onClick={close} disabled={!!rendering} aria-label="Close editor">
            <X size={18} />
          </button>
        </header>
        {notice && <p className="editor-notice">{notice}</p>}
        <div className="editor-stage">
          <video
            ref={videoRef}
            src={url}
            playsInline
            preload="auto"
            muted={edit.muted}
            onLoadedMetadata={(e) => {
              const v = e.currentTarget;
              if (v.videoWidth && v.videoHeight) setAspect(v.videoWidth / v.videoHeight);
              seek(0);
            }}
            onClick={() => (playing ? pause() : play())}
            onTimeUpdate={() => void advance()}
            onPause={() => setPlaying(false)}
            aria-label="Edited video preview"
          />
        </div>
        <div className="editor-toolbar" role="toolbar" aria-label="Editing tools">
          <div className="editor-tool-group">
            <button type="button" className="editor-play" onClick={() => (playing ? pause() : play())} aria-label={playing ? "Pause" : "Play"}>
              {playing ? <Pause size={17} /> : <Play size={17} />}
            </button>
            <span className="editor-time" aria-live="off">
              {format(time)} <small>/ {format(total)}</small>
            </span>
          </div>
          <div className="editor-tool-group">
            <button type="button" onClick={split} aria-label="Split at playhead" title="Split at playhead (S)">
              <Scissors size={15} /> <span>Split</span>
            </button>
            <button type="button" onClick={remove} disabled={edit.clips.length < 2} aria-label="Delete selected part" title="Delete selected part (Delete)">
              <Trash2 size={15} /> <span>Delete</span>
            </button>
            <button type="button" onClick={() => move(-1)} disabled={selectedIndex <= 0} aria-label="Move selected part earlier" title="Move earlier">
              <ArrowLeft size={15} />
            </button>
            <button type="button" onClick={() => move(1)} disabled={selectedIndex < 0 || selectedIndex >= edit.clips.length - 1} aria-label="Move selected part later" title="Move later">
              <ArrowRight size={15} />
            </button>
            <button type="button" onClick={() => commit({ ...edit, muted: !edit.muted })} aria-pressed={edit.muted} aria-label="Mute sound" title={edit.muted ? "Turn sound on" : "Mute sound"}>
              {edit.muted ? <VolumeX size={15} /> : <Volume2 size={15} />} <span>{edit.muted ? "Muted" : "Sound"}</span>
            </button>
          </div>
          <div className="editor-tool-group">
            <button type="button" onClick={undo} disabled={!past.length} aria-label="Undo" title="Undo (⌘/Ctrl Z)">
              <Undo2 size={15} />
            </button>
            <button type="button" onClick={redo} disabled={!future.length} aria-label="Redo" title="Redo (⌘/Ctrl Shift Z)">
              <Redo2 size={15} />
            </button>
            <button type="button" onClick={() => setZoom(Math.max(2, pps / 1.5))} aria-label="Zoom out timeline">
              <Minus size={15} />
            </button>
            <button type="button" onClick={fit} aria-label="Fit timeline" title="Fit timeline">
              <Maximize2 size={14} />
            </button>
            <button type="button" onClick={() => setZoom(Math.min(240, pps * 1.5))} aria-label="Zoom in timeline">
              <Plus size={15} />
            </button>
          </div>
        </div>
        <div className="editor-timeline" ref={timelineRef}>
          <div className="editor-track" style={{ width: total * pps + TRACK_INSET * 2 }} onPointerDown={startScrub}>
            {edit.clips.map((clip, index) => {
              const width = clipLength(clip) * pps;
              const tiles = Math.max(1, Math.ceil(width / thumbWidth));
              return (
                <div
                  key={clip.id}
                  className={`editor-clip ${clip.id === selected ? "is-selected" : ""}`}
                  style={{ left: offsets[index] * pps, width }}
                  aria-label={`Part ${index + 1}: ${format(clipLength(clip))}`}
                >
                  <div className="editor-clip-frames" aria-hidden="true">
                    {thumbs.urls.length > 0 &&
                      Array.from({ length: tiles }, (_, i) => {
                        const at = clip.start + ((i + 0.5) * thumbWidth) / pps;
                        const src = thumbs.urls[Math.min(thumbs.urls.length - 1, Math.floor(at / thumbs.step))];
                        // eslint-disable-next-line @next/next/no-img-element
                        return src ? <img key={i} src={src} alt="" style={{ width: thumbWidth }} draggable={false} /> : <span key={i} style={{ width: thumbWidth }} />;
                      })}
                  </div>
                  {width > 44 && <span className="editor-clip-length">{format(clipLength(clip))}</span>}
                  {(["start", "end"] as const).map((edge) => (
                    <div
                      key={edge}
                      className={`editor-handle is-${edge}`}
                      role="slider"
                      tabIndex={0}
                      aria-label={`Trim ${edge === "start" ? "beginning" : "end"} of part ${index + 1}`}
                      aria-valuemin={0}
                      aria-valuemax={Number(duration.toFixed(2))}
                      aria-valuenow={Number((edge === "start" ? clip.start : clip.end).toFixed(2))}
                      aria-valuetext={format(edge === "start" ? clip.start : clip.end)}
                      onPointerDown={(e) => startTrim(e, clip.id, edge)}
                      onKeyDown={(e) => trimByKey(e, clip.id, edge)}
                    />
                  ))}
                </div>
              );
            })}
            <div className="editor-playhead" style={{ transform: `translateX(${time * pps}px)` }} aria-hidden="true" />
          </div>
        </div>
        <p className="editor-hint">
          Drag the edges of a part to trim. Move the playhead and press <kbd>S</kbd> to split, then delete or reorder parts.
        </p>
        {error && <p className="editor-error" role="alert">{error}</p>}
        <footer className="editor-footer">
          <p className={tooShort || tooLong ? "is-warning" : ""} role="status">
            <strong>{format(total)}</strong> {status}
          </p>
          <div>
            <button type="button" className="editor-secondary" onClick={() => void output("download")} disabled={!!rendering}>
              <Download size={15} /> Download
            </button>
            <button type="button" className="editor-primary" onClick={() => void output("apply")} disabled={!!rendering || tooShort || tooLong}>
              <Check size={15} /> {applyLabel}
            </button>
          </div>
        </footer>
        {rendering && (
          <div className="editor-rendering" role="status">
            <strong>{rendering.action === "apply" ? "Preparing your edit" : "Preparing your download"}</strong>
            <div className="editor-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(rendering.progress * 100)}>
              <span style={{ width: `${rendering.progress * 100}%` }} />
            </div>
            <span>{Math.round(rendering.progress * 100)}% · This happens on your device and can take a moment.</span>
            <button type="button" className="editor-secondary" onClick={() => abort.current?.abort()}>
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
