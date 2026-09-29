"use client";

import type { ChatMessage, Job } from "./use-studio-chat";

// A conversation moved aside by "New video" while its video keeps generating.
export type BackgroundVideo = {
  id: string;
  history: ChatMessage[];
  message: ChatMessage;
  job: Job;
  done: boolean;
  result?: string;
  error?: string;
};

const KEY = "reelform-background-videos";
// Client-side navigation keeps this copy, including local previews.
let memory: BackgroundVideo[] | null = null;

// Local previews don't survive a reload, so the saved copy leaves them out.
const withoutPreviews = (message: ChatMessage): ChatMessage => ({
  ...message,
  videoUrl: message.videoUrl?.startsWith("blob:") ? undefined : message.videoUrl,
  images: message.images.filter((image) => !image.url.startsWith("blob:")),
});

export function loadBackgroundVideos(): BackgroundVideo[] {
  if (memory) return memory;
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY) || "[]") as BackgroundVideo[];
    memory = Array.isArray(saved) ? saved.filter((item) => item?.job?.token) : [];
  } catch {
    memory = [];
  }
  return memory;
}

export function saveBackgroundVideos(items: BackgroundVideo[]) {
  memory = items;
  try {
    if (!items.length) sessionStorage.removeItem(KEY);
    else
      sessionStorage.setItem(
        KEY,
        JSON.stringify(
          items.map((item) => ({
            ...item,
            history: item.history.map(withoutPreviews),
            message: withoutPreviews(item.message),
          })),
        ),
      );
  } catch {
    /* The in-memory copy still covers this visit. */
  }
}

/** Local preview URLs a conversation holds, so they aren't released while it's in the background. */
export function previewUrls(messages: ChatMessage[]) {
  return messages.flatMap((message) =>
    [message.videoUrl, ...message.images.map((image) => image.url)].filter(
      (url): url is string => !!url?.startsWith("blob:"),
    ),
  );
}
