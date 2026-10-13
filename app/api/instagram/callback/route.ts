import { requireInstagramAccess } from "@/lib/instagram/access";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireUser, admin, checked } from "@/lib/supabase/server";
import {
  instagramConfig,
  encryptToken,
  matchesState,
  OAUTH_COOKIE,
  stateHash,
} from "@/lib/instagram/security";
import { exchangeCode } from "@/lib/instagram/api";
import { connectionFor, disconnectInstagram } from "@/lib/instagram/server";
export const maxDuration = 120;
export async function GET(request: Request) {
  let path = "/instagram";
  let outcome = "failed";
  const jar = await cookies();
  try {
    const config = instagramConfig();
    if (new URL(request.url).origin !== config.origin)
      throw new Error("Wrong callback origin");
    const user = await requireUser(request);
    await requireInstagramAccess(user.id);
    const params = new URL(request.url).searchParams;
    const state = params.get("state");
    if (!matchesState(state, jar.get(OAUTH_COOKIE)?.value))
      throw new Error("Invalid OAuth state");
    // Atomic consumption makes the callback single-use and binds it to the Reelform account.
    const { data } = await checked(
      admin()
        .from("rf_instagram_oauth_states")
        .delete()
        .eq("state_hash", stateHash(state!))
        .eq("user_id", user.id)
        .gt("expires_at", new Date().toISOString())
        .select("return_path")
        .maybeSingle(),
    );
    if (!data) throw new Error("Expired OAuth state");
    if (/^\/instagram(?:\?generation=[\da-f-]{36})?$/.test(data.return_path))
      path = data.return_path;
    if (params.has("error")) outcome = "cancelled";
    else {
      const code = params.get("code");
      if (!code || code.length > 4096)
        throw new Error("Missing authorization code");
      const token = await exchangeCode(code);
      const previous = await connectionFor(user.id);
      if (previous && previous.instagram_user_id !== token.instagram_user_id)
        await disconnectInstagram(user.id);
      await checked(
        admin()
          .from("rf_instagram_connections")
          .upsert(
            {
              user_id: user.id,
              instagram_user_id: token.instagram_user_id,
              app_scoped_id: token.app_scoped_id,
              username: token.username,
              token_ciphertext: encryptToken(token.access_token, user.id),
              expires_at: new Date(
                Date.now() + token.expires_in * 1000,
              ).toISOString(),
              refreshed_at: new Date().toISOString(),
              reconnect_required: false,
            },
            { onConflict: "user_id" },
          ),
      );
      outcome = "connected";
    }
  } catch {
    /* Never expose provider errors, codes, or tokens in redirect URLs. */
  }
  jar.set(OAUTH_COOKIE, "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/api/instagram",
    maxAge: 0,
  });
  const redirect = new URL(path, request.url);
  redirect.searchParams.set("instagram", outcome);
  const response = NextResponse.redirect(redirect, 303);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
