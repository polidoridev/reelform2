import { cookies } from "next/headers";
import { z } from "zod";
import { authClient, requireUser, accountFor } from "@/lib/supabase/server";
import {
  ApiError,
  readJson,
  errorResponse,
  sameOrigin,
  appUrl,
  noStore,
} from "@/lib/http";
import { seal, unseal } from "@/lib/commerce/seal";
const email = z.string().trim().email().max(254);
const password = z.string().min(10).max(128);
export async function POST(
  request: Request,
  { params }: { params: Promise<{ action: string }> },
) {
  try {
    sameOrigin(request);
    const { action } = await params;
    const body = await readJson(request);
    const client = await authClient();
    if (action === "google") {
      const { data, error } = await client.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${new URL(request.url).origin}/auth/callback`,
          skipBrowserRedirect: true,
          queryParams: { prompt: "select_account" },
        },
      });
      if (error || !data.url)
        throw new ApiError("Google sign-in is unavailable. Please try again shortly.", 503);
      return noStore({ redirect: data.url });
    }
    if (action === "login") {
      const { data, error } = await client.auth.signInWithPassword({
        email: email.parse(body.email),
        password: z.string().min(1).max(128).parse(body.password),
      });
      if (error)
        throw new ApiError(
          "Email or password is incorrect, or your email still needs confirmation.",
          401,
        );
      await accountFor(data.user);
      return noStore({ ok: true });
    }
    if (action === "signup") {
      const { data, error } = await client.auth.signUp({
        email: email.parse(body.email),
        password: password.parse(body.password),
        options: {
          emailRedirectTo: `${appUrl()}/auth/confirm`,
          data: {
            full_name: z
              .string()
              .trim()
              .max(100)
              .parse(body.name || ""),
            marketing_opt_in: body.marketing === true,
          },
        },
      });
      if (error)
        throw new ApiError(
          "We could not create your account. Try again shortly or sign in if you already have one.",
        );
      if (data.session && data.user) {
        await accountFor(data.user);
        return noStore({ ok: true, redirect: "/account" });
      }
      return noStore({
        message: "Check your inbox to confirm your email before signing in.",
      });
    }
    if (action === "forgot") {
      const { error } = await client.auth.resetPasswordForEmail(email.parse(body.email), {
        redirectTo: `${appUrl()}/auth/confirm`,
      });
      if (error)
        throw new ApiError(
          "We couldn’t send a password reset email right now. Please try again later or contact admin@polidori.dev.",
          503,
        );
      return noStore({
        message:
          "If an account exists for that address, a password reset link is on its way.",
      });
    }
    if (action === "verify") {
      const type = z
        .enum([
          "email",
          "signup",
          "recovery",
          "invite",
          "email_change",
          "magiclink",
        ])
        .parse(body.type);
      const { data, error } = await client.auth.verifyOtp({
        token_hash: z.string().min(20).max(500).parse(body.tokenHash),
        type,
      });
      if (error)
        throw new ApiError(
          "This email link has expired or has already been used. Request a new one.",
        );
      if (!data.user) {
        if (type === "email_change")
          return noStore({
            message:
              "One confirmation received. Check the other email address to finish changing your email.",
          });
        throw new ApiError(
          "This email link could not create a session. Request a new link.",
        );
      }
      await accountFor(data.user);
      if (type === "recovery") {
        (await cookies()).set(
          "rf-recovery",
          seal({
            user: data.user.id,
            kind: "recovery",
            exp: Date.now() + 20 * 60000,
          }),
          {
            httpOnly: true,
            secure: new URL(request.url).protocol === "https:",
            sameSite: "lax",
            path: "/",
            maxAge: 1200,
          },
        );
      }
      return noStore({
        redirect: type === "recovery" ? "/login?mode=reset" : "/account",
      });
    }
    if (action === "reset") {
      const user = await requireUser(request);
      const token = (await cookies()).get("rf-recovery")?.value;
      if (!token)
        throw new ApiError(
          "Open the password reset link from your email first.",
          403,
        );
      const recovery = unseal(token);
      if (recovery.user !== user.id || recovery.kind !== "recovery")
        throw new ApiError("Invalid recovery session.", 403);
      const { error } = await client.auth.updateUser({
        password: password.parse(body.password),
      });
      if (error)
        throw new ApiError(
          "Could not update your password. Choose a different password and try again.",
        );
      (await cookies()).delete("rf-recovery");
      await client.auth.signOut({ scope: "others" });
      return noStore({ ok: true });
    }
    if (action === "logout") {
      await requireUser(request);
      await client.auth.signOut({
        scope: body.everywhere === true ? "global" : "local",
      });
      return noStore({ ok: true });
    }
    throw new ApiError("Unknown account action.", 404);
  } catch (error) {
    if (error instanceof z.ZodError)
      return errorResponse(
        new ApiError(
          "Check your email and use a password of at least 10 characters.",
        ),
      );
    return errorResponse(error);
  }
}
