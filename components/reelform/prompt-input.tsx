"use client";

import { Fragment, useId, useState, type RefObject } from "react";
import { Film, ImageIcon } from "lucide-react";
import { findReferences } from "@/lib/prompt-references";
import "./composer.css";

export type ReferenceOption = { token: string; label: string; preview?: string; kind: "video" | "image" };

// The @word being typed right before the caret, if any.
function mentionAt(value: string, caret: number) {
  const match = /(?:^|[^\w@])@(\w*)$/.exec(value.slice(0, caret));
  return match ? { query: match[1].toLowerCase(), start: caret - match[1].length - 1 } : null;
}

export function PromptWithReferences({ text }: { text: string }) {
  const refs = findReferences(text);
  return (
    <>
      {refs.map((ref, i) => (
        <Fragment key={ref.start}>
          {text.slice(i ? refs[i - 1].end : 0, ref.start)}
          <span className="chat-ref-token">{ref.token}</span>
        </Fragment>
      ))}
      {text.slice(refs.at(-1)?.end ?? 0)}
    </>
  );
}

export default function PromptInput({
  value,
  onChange,
  options,
  inputRef,
  disabled,
  onSubmitShortcut,
  describedBy,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  options: ReferenceOption[];
  inputRef: RefObject<HTMLTextAreaElement | null>;
  disabled: boolean;
  onSubmitShortcut: () => void;
  describedBy?: string;
  placeholder: string;
}) {
  const [mention, setMention] = useState<{ query: string; start: number } | null>(null);
  const [active, setActive] = useState(0);
  const listId = useId();
  const matches = mention ? options.filter((o) => o.token.slice(1).startsWith(mention.query)) : [];
  const menuOpen = !!mention && matches.length > 0;
  const current = Math.min(active, Math.max(matches.length - 1, 0));

  function sync(el: HTMLTextAreaElement) {
    const next = el.selectionStart === el.selectionEnd ? mentionAt(el.value, el.selectionStart) : null;
    setMention((prev) => (prev?.start === next?.start && prev?.query === next?.query ? prev : next));
    if (next?.start !== mention?.start) setActive(0);
  }
  function insert(option: ReferenceOption) {
    const el = inputRef.current;
    if (!el || !mention) return;
    const end = mention.start + 1 + mention.query.length;
    const after = value.slice(end);
    const spacer = after.startsWith(" ") ? "" : " ";
    const next = value.slice(0, mention.start) + option.token + spacer + after;
    onChange(next.slice(0, 2000));
    setMention(null);
    const caret = mention.start + option.token.length + spacer.length;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(caret, caret);
    });
  }

  return (
    <div className="chat-prompt-field">
      <textarea
        id="studio-prompt"
        ref={inputRef}
        value={value}
        disabled={disabled}
        maxLength={2000}
        rows={3}
        role="combobox"
        aria-expanded={menuOpen}
        aria-controls={menuOpen ? listId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={menuOpen ? `${listId}-${current}` : undefined}
        onChange={(e) => {
          onChange(e.target.value);
          sync(e.target);
        }}
        onSelect={(e) => sync(e.currentTarget)}
        onBlur={() => setMention(null)}
        onKeyDown={(e) => {
          if (menuOpen) {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              setActive((current + (e.key === "ArrowDown" ? 1 : matches.length - 1)) % matches.length);
              return;
            }
            if ((e.key === "Enter" && !e.metaKey && !e.ctrlKey) || e.key === "Tab") {
              e.preventDefault();
              insert(matches[current]);
              return;
            }
            if (e.key === "Escape") {
              e.preventDefault();
              setMention(null);
              return;
            }
          }
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) {
            e.preventDefault();
            onSubmitShortcut();
          }
        }}
        placeholder={placeholder}
        aria-describedby={describedBy}
      />
      {menuOpen && (
        <ul className="chat-mention-menu" id={listId} role="listbox" aria-label="Mention your video or photos">
          {matches.map((option, i) => (
            <li
              key={option.token}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === current}
              // Keep focus in the textarea so the caret position survives the click.
              onMouseDown={(e) => {
                e.preventDefault();
                insert(option);
              }}
              onMouseEnter={() => setActive(i)}
            >
              <span className="chat-mention-preview">
                {option.preview ? (
                  option.kind === "video" ? (
                    <video src={option.preview} muted playsInline preload="metadata" aria-hidden="true" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={option.preview} alt="" />
                  )
                ) : option.kind === "video" ? (
                  <Film size={14} />
                ) : (
                  <ImageIcon size={14} />
                )}
              </span>
              <strong>{option.token}</strong>
              <small>{option.label}</small>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
