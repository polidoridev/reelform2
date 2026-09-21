import { z } from "zod";

export const COMMUNITY_BUCKET = "reelform-community";
export const COMMUNITY_MAX_BYTES = 50 * 1024 * 1024;
export const COMMUNITY_RIGHTS_VERSION = "2026-09-21";
export const communityUploadSchema = z.object({
  bytes: z.number().int().min(16).max(COMMUNITY_MAX_BYTES),
  contentType: z.enum(["video/mp4", "video/webm"]),
});
export const communityPublishSchema = z.object({
  title: z.string().trim().min(1).max(80),
  creator: z.string().trim().min(1).max(40),
  caption: z.string().trim().max(500).default(""),
  aiAssisted: z.boolean(),
  consent: z.literal(true),
});
export type CommunityPost = {
  id: string;
  title: string;
  creator: string;
  caption: string;
  ai_assisted: boolean;
  published_at: string;
  canRemove: boolean;
};
