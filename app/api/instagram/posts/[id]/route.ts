import { requireInstagramAccess } from "@/lib/instagram/access";
import { z } from "zod";
import { requireUser } from "@/lib/supabase/server";
import { ApiError, errorResponse, noStore } from "@/lib/http";
import { instagramConfig } from "@/lib/instagram/security";
import {
  cancelPost,
  getPost,
  processPost,
  publicPost,
} from "@/lib/instagram/server";
export const maxDuration = 120;
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser(request);
    await requireInstagramAccess(user.id);
    instagramConfig();
    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success)
      throw new ApiError("Post not found.", 404);
    await processPost(await getPost(user.id, id));
    return noStore({ post: publicPost(await getPost(user.id, id)) });
  } catch (error) {
    return errorResponse(error);
  }
}

// Cancellation remains available after downgrade so users retain control of their queue.
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser(request);
    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success)
      throw new ApiError("Post not found.", 404);
    return noStore({ post: publicPost(await cancelPost(user.id, id)) });
  } catch (error) {
    return errorResponse(error);
  }
}
