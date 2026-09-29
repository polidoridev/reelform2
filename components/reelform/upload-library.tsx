"use client";

import { useEffect, useState } from "react";
import { Check, Film, ImageIcon, Loader2, Trash2, X } from "lucide-react";
import type { LibraryItem } from "@/lib/commerce/upload-library";

type Props = {
  items: LibraryItem[] | null;
  error: string;
  opening: string | null;
  attached: Set<string>;
  canPickVideo: boolean;
  canPickImage: boolean;
  imageLimitNote: string;
  onLoad: () => void;
  onPick: (item: LibraryItem) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
};

const size = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

export default function UploadLibrary({
  items, error, opening, attached, canPickVideo, canPickImage, imageLimitNote, onLoad, onPick, onDelete, onClose,
}: Props) {
  const [confirming, setConfirming] = useState<string | null>(null);
  // Reload on open so uploads saved since last time appear.
  useEffect(() => {
    onLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const videos = items?.filter((item) => item.kind === "video") ?? [];
  const photos = items?.filter((item) => item.kind === "image") ?? [];

  const tile = (item: LibraryItem) => {
    const isAttached = attached.has(item.id);
    const allowed = item.kind === "video" ? canPickVideo : canPickImage;
    return (
      <li key={item.id} className="chat-library-item">
        <button
          type="button"
          className="chat-library-pick"
          disabled={!allowed || isAttached || !!opening}
          onClick={() => onPick(item)}
          title={isAttached ? "Already added" : item.kind === "image" && !allowed ? imageLimitNote : `Use ${item.name}`}
        >
          {item.kind === "video" ? (
            <video src={`${item.url}#t=0.1`} muted playsInline preload="metadata" aria-hidden="true" />
          ) : (
            // Signed storage links can't go through the image optimizer.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.url} alt="" loading="lazy" />
          )}
          <span className="chat-library-name">{item.name}</span>
          <small>
            {item.duration ? `${item.duration.toFixed(1)} sec · ` : ""}
            {size(item.bytes)}
          </small>
          {opening === item.id && (
            <span className="chat-library-state">
              <Loader2 size={16} className="chat-library-spin" /> Opening…
            </span>
          )}
          {isAttached && (
            <span className="chat-library-state">
              <Check size={16} /> Added
            </span>
          )}
        </button>
        {confirming === item.id ? (
          <div className="chat-library-confirm">
            <button type="button" onClick={() => { setConfirming(null); onDelete(item.id); }}>Delete</button>
            <button type="button" onClick={() => setConfirming(null)}>Keep</button>
          </div>
        ) : (
          <button
            type="button"
            className="chat-library-delete"
            aria-label={`Delete ${item.name} from your uploads`}
            title="Delete from your uploads"
            onClick={() => setConfirming(item.id)}
          >
            <Trash2 size={13} />
          </button>
        )}
      </li>
    );
  };

  return (
    <section className="chat-library" aria-label="Your uploads">
      <div className="chat-library-heading">
        <div>
          <strong>Your uploads</strong>
          <span>Videos and photos you upload are saved here to use again.</span>
        </div>
        <button type="button" onClick={onClose} aria-label="Close your uploads">
          <X size={16} />
        </button>
      </div>
      {error && <p className="chat-library-message" role="alert">{error}</p>}
      {items === null && !error && (
        <p className="chat-library-message">
          <Loader2 size={14} className="chat-library-spin" /> Loading your uploads…
        </p>
      )}
      {items?.length === 0 && (
        <p className="chat-library-message">Nothing saved yet. Videos and photos you upload will appear here.</p>
      )}
      {videos.length > 0 && (
        <>
          <h3><Film size={13} /> Videos</h3>
          <ul className="chat-library-grid">{videos.map(tile)}</ul>
        </>
      )}
      {photos.length > 0 && (
        <>
          <h3><ImageIcon size={13} /> Photos</h3>
          {!canPickImage && <p className="chat-library-note">{imageLimitNote}</p>}
          <ul className="chat-library-grid">{photos.map(tile)}</ul>
        </>
      )}
      {!!items?.length && (
        <p className="chat-library-note">Keeps your 60 most recently used videos and 120 photos. Deleting one here removes it for good.</p>
      )}
    </section>
  );
}
