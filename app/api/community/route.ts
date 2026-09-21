import {
  admin,
  currentUser,
  isReelformAdmin,
  checked,
} from "@/lib/supabase/server";
import { ApiError, errorResponse, noStore } from "@/lib/http";
import { COMMUNITY_COLUMNS } from "@/lib/community";

export async function GET(request: Request) {
  try {
    const q = new URL(request.url).searchParams;
    const mine = q.get("mine") === "true";
    const user = await currentUser();
    if (mine && !user) throw new ApiError("Sign in to see your posts.", 401);
    const page = Number(q.get("page") || 0);
    if (!Number.isSafeInteger(page) || page < 0 || page > 10000)
      throw new ApiError("Invalid page.");
    let query = admin()
      .from("rf_community_posts")
      .select(COMMUNITY_COLUMNS)
      .eq("status", "published");
    if (mine) query = query.eq("user_id", user!.id);
    const { data } = await checked(
      query
        .order("published_at", { ascending: false })
        .order("id", { ascending: false })
        .range(page * 12, page * 12 + 12),
    );
    return noStore({
      posts: (data || []).slice(0, 12).map(({ user_id, ...post }) => ({
        ...post,
        canRemove: !!user && (user.id === user_id || isReelformAdmin(user)),
      })),
      hasMore: (data?.length || 0) > 12,
      signedIn: !!user,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
