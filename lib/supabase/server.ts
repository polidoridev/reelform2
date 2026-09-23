import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { ApiError, sameOrigin } from "@/lib/http";
export const authConfigured = () =>
  Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
export async function authClient({ readOnly = false } = {}) {
  if (!authConfigured())
    throw new ApiError("Account services are not connected yet.", 503);
  const jar = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => jar.getAll(),
        setAll: (entries) => {
          // Server Components cannot write cookies. proxy.ts persists session
          // refreshes before those pages render; route handlers remain writable.
          if (readOnly) return;
          entries.forEach(({ name, value, options }) =>
            jar.set(name, value, options),
          );
        },
      },
    },
  );
}
export function admin() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY)
    throw new ApiError("Account services are not connected yet.", 503);
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
export async function currentUser(options: { readOnly?: boolean } = {}) {
  if (!authConfigured()) return null;
  const client = await authClient(options);
  const { data, error } = await client.auth.getUser();
  return error ? null : data.user;
}
export async function requireUser(request?: Request) {
  if (request && request.method !== "GET") sameOrigin(request);
  const user = await currentUser();
  if (!user || !user.email_confirmed_at)
    throw new ApiError("Sign in with a verified email to continue.", 401);
  return user;
}
export async function accountFor(user: {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
}) {
  const db = admin();
  const { data: existing, error } = await db
    .from("rf_accounts")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  let data = existing;
  if (error) throw new ApiError("Could not load your account.", 503);
  if (!data) {
    const meta = user.user_metadata || {};
    const opted = meta.marketing_opt_in === true;
    const result = await db.from("rf_accounts").upsert(
      {
        user_id: user.id,
        email: user.email || "",
        full_name: String(meta.full_name || "").slice(0, 100),
        marketing_opt_in: opted,
        marketing_consent_at: opted ? new Date().toISOString() : null,
        marketing_consent_source: opted ? "signup_v1" : null,
      },
      { onConflict: "user_id", ignoreDuplicates: true },
    );
    if (result.error)
      throw new ApiError("Could not initialize your account.", 503);
    const again = await db
      .from("rf_accounts")
      .select("*")
      .eq("user_id", user.id)
      .single();
    if (again.error) throw new ApiError("Could not load your account.", 503);
    data = again.data;
  }
  if (data.email !== user.email) {
    const r = await db
      .from("rf_accounts")
      .update({ email: user.email })
      .eq("user_id", user.id);
    if (r.error) throw r.error;
    data.email = user.email;
  }
  return data;
}
export async function checked<T extends { error: unknown }>(
  request: PromiseLike<T>,
): Promise<T> {
  const result = await request;
  if (result.error)
    throw new ApiError("We could not save this change. Please try again.", 503);
  return result;
}

// Only Supabase's server-managed app metadata can grant owner testing access.
// Never derive this from signup/profile data or a client-provided role.
export function isReelformAdmin(user: { app_metadata?: Record<string, unknown> }) {
  return user.app_metadata?.reelform_admin === true;
}
