import { instagramAccess } from "@/lib/instagram/access";
import { z } from "zod";
import { requireUser, admin, checked } from "@/lib/supabase/server";
import { ApiError, errorResponse, noStore } from "@/lib/http";
import { instagramConfigured } from "@/lib/instagram/security";
import {
  connectionFor,
  disconnectInstagram,
  ownedVideo,
  publicPost,
} from "@/lib/instagram/server";
export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const eligible = await instagramAccess(user.id);
    const id = new URL(request.url).searchParams.get("generation");
    if (id && !z.string().uuid().safeParse(id).success)
      throw new ApiError("Video not found.", 404);
    const video = id ? await ownedVideo(user.id, id) : null;
    if (!instagramConfigured())
      return noStore({
        eligible,
        ready: false,
        connection: null,
        posts: [],
        video,
      });
    const [connection, posts] = await Promise.all([
      connectionFor(user.id),
      checked(
        admin()
          .from("rf_instagram_posts")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(20),
      ),
    ]);
    // Include a selected older post even if it falls outside the recent list.
    let selectedPost = null;
    if (id && connection) {
      const result = await checked(
        admin()
          .from("rf_instagram_posts")
          .select("*")
          .eq("user_id", user.id)
          .eq("job_id", id)
          .eq("instagram_user_id", connection.instagram_user_id)
          .maybeSingle(),
      );
      selectedPost = result.data ? publicPost(result.data) : null;
    }
    return noStore({
      ready: true,
      eligible,
      connection: connection
        ? {
            id: connection.instagram_user_id,
            username: connection.username,
            reconnectRequired:
              connection.reconnect_required ||
              Date.parse(connection.expires_at) <= Date.now(),
          }
        : null,
      posts: (posts.data || []).map(publicPost),
      selectedPost,
      video,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function DELETE(request: Request) {
  try {
    const user = await requireUser(request);
    await disconnectInstagram(user.id);
    return noStore({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
