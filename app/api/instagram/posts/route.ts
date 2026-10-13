import { requireInstagramAccess } from "@/lib/instagram/access";
import { z } from "zod";
import { requireUser } from "@/lib/supabase/server";
import { ApiError, errorResponse, noStore, readJson } from "@/lib/http";
import { instagramConfig } from "@/lib/instagram/security";
import { processPost, publicPost, reservePost } from "@/lib/instagram/server";
export const maxDuration = 120;
export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    await requireInstagramAccess(user.id);
    instagramConfig();
    const body = z
      .object({
        generation: z.string().uuid(),
        instagramAccountId: z.string().regex(/^\d+$/),
        caption: z.string().trim().max(2200),
        shareToFeed: z.boolean(),
        consent: z.literal(true),
        retry: z.boolean().optional(),
        scheduledAt: z
          .string()
          .datetime({ offset: true })
          .nullable()
          .optional(),
      })
      .safeParse(await readJson(request));
    if (!body.success)
      throw new ApiError(
        "Review your caption and confirm publishing to Instagram.",
      );
    const post = await reservePost(
      user.id,
      body.data.generation,
      body.data.caption,
      body.data.shareToFeed,
      body.data.retry,
      body.data.instagramAccountId,
      body.data.scheduledAt,
    );
    return noStore({ post: publicPost(await processPost(post)) }, 202);
  } catch (error) {
    return errorResponse(error);
  }
}
