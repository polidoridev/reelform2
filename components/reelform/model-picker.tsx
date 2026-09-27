"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, CircleHelp, Replace, Sparkles, X } from "lucide-react";
import { FEATURED_VIDEO_MODELS, VIDEO_MODELS, type VideoModel } from "@/lib/video-models";
import "./composer.css";

const icons: Record<string, typeof Sparkles> = { "genjutsu-motion": Sparkles, "genjutsu-object": Replace };
const bestQuality = (model: VideoModel) => {
  const top = [...model.resolutions].sort((a, b) => parseInt(b) - parseInt(a))[0];
  return model.resolutions.length > 1 ? `Up to ${top}` : top;
};
const photos = (model: VideoModel) =>
  model.minImages === model.maxImages
    ? `${model.minImages} photo`
    : model.minImages
      ? `${model.minImages}–${model.maxImages} photos`
      : `Photos optional`;

// "?" help that opens on hover or keyboard focus, and toggles on tap for touch screens.
function ModelHelp({ model }: { model: VideoModel }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className={`chat-model-help ${open ? "is-open" : ""}`} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-label={`What ${model.name} is best at`}
        aria-describedby={id}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => { if (e.key === "Escape" && open) { e.stopPropagation(); setOpen(false); } }}
      >
        <CircleHelp size={15} />
      </button>
      <span role="tooltip" id={id}>
        <strong>Best for</strong>
        {model.bestFor}
      </span>
    </span>
  );
}

export default function ModelPicker({
  model,
  onChange,
  disabled,
  videoSeconds,
}: {
  model: string;
  onChange: (id: string) => void;
  disabled: boolean;
  videoSeconds: number | null;
}) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const featured = FEATURED_VIDEO_MODELS.some((m) => m.id === model);
  const selected = VIDEO_MODELS.find((m) => m.id === model);
  useEffect(() => {
    if (open) panel.current?.querySelector<HTMLButtonElement>("[aria-pressed=true]")?.focus();
  }, [open]);
  function choose(id: string) {
    onChange(id);
    setOpen(false);
  }
  return (
    <div className="chat-model-picker">
      <div className="chat-model-row">
        <div className="chat-model-choices" role="radiogroup" aria-label="Recommended AI models">
          {FEATURED_VIDEO_MODELS.map((m) => {
            const Icon = icons[m.id] ?? Sparkles;
            return (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={m.id === model}
                disabled={disabled}
                onClick={() => choose(m.id)}
                title={m.description}
              >
                <Icon size={15} /> {m.shortName ?? m.name}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          className={`chat-more-models ${featured ? "" : "is-active"}`}
          aria-expanded={open}
          aria-controls={listId}
          disabled={disabled}
          onClick={() => setOpen(!open)}
        >
          <span>{featured ? "More models" : selected?.name}</span>
          <ChevronDown size={13} />
        </button>
      </div>
      {open && (
        <div
          className="chat-models-panel"
          id={listId}
          ref={panel}
          onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } }}
        >
          <div className="chat-settings-title">
            <strong>All models, ranked for your footage</strong>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close model list">
              <X size={16} />
            </button>
          </div>
          <ol className="chat-model-list">
            {VIDEO_MODELS.map((m, i) => {
              const tooLong = videoSeconds !== null && videoSeconds > m.maxSeconds;
              return (
                <li key={m.id}>
                  <button type="button" aria-pressed={m.id === model} disabled={disabled} onClick={() => choose(m.id)}>
                    <span className="chat-model-rank" aria-hidden="true">{i + 1}</span>
                    <span className="chat-model-name">
                      {m.name}
                      {m.featured && <em>Recommended</em>}
                      <small className={tooLong ? "is-warning" : ""}>
                        {tooLong ? `Trim your clip to ${m.maxSeconds}s` : `Up to ${m.maxSeconds}s`} · {bestQuality(m)} · {photos(m)}
                      </small>
                    </span>
                    {m.id === model && <Check size={15} className="chat-model-check" aria-hidden="true" />}
                  </button>
                  <ModelHelp model={m} />
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}
