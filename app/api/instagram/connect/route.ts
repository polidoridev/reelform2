import { requireInstagramAccess } from "@/lib/instagram/access";
import { cookies } from "next/headers";
import { z } from "zod";
import { requireUser, admin, checked } from "@/lib/supabase/server";
import { ApiError, errorResponse, noStore, readJson } from "@/lib/http";
import {
  instagramConfig,
  newState,
  OAUTH_COOKIE,
  stateHash,
} from "@/lib/instagram/security";
import { authorizationUrl } from "@/lib/instagram/api";
export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    await requireInstagramAccess(user.id);
    const config = instagramConfig();
    if (new URL(request.url).origin !== config.origin)
      throw new ApiError(
        "Open Reelform on its connected Instagram domain to continue.",
        409,
      );
    const parsed = z
      .object({ generation: z.string().uuid().optional() })
      .safeParse(await readJson(request));
    if (!parsed.success) throw new ApiError("Invalid video selection.");
    const state = newState();
    await checked(
      admin().from("rf_instagram_oauth_states").delete().eq("user_id", user.id),
    );
    await checked(
      admin()
        .from("rf_instagram_oauth_states")
        .insert({
          state_hash: stateHash(state),
          user_id: user.id,
          return_path: parsed.data.generation
            ? `/instagram?generation=${parsed.data.generation}`
            : "/instagram",
          expires_at: new Date(Date.now() + 600000).toISOString(),
        }),
    );
    (await cookies()).set(OAUTH_COOKIE, state, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/api/instagram",
      maxAge: 600,
    });
    return noStore({ url: authorizationUrl(state) });
  } catch (error) {
    return errorResponse(error);
  }
}
