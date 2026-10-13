import type { AspectRatio } from "../video-models";

export type GenerationAsset = {
  slot: string;
  name: string;
  type: string;
  bytes: number;
  url: string;
};
export type SavedGeneration = {
  id: string;
  prompt: string;
  model: string;
  resolution: string;
  generateAudio: boolean;
  trial: boolean;
  aspectRatio?: AspectRatio;
  duration: number;
  status: string;
  createdAt: string;
  result: string | null;
  error: string | null;
  assets: GenerationAsset[];
};
export type GenerationChat = {
  generation: SavedGeneration;
  history: SavedGeneration[];
  token: string;
};
export function generationChatUrl(id: string) {
  return `/studio?generation=${encodeURIComponent(id)}`;
}
