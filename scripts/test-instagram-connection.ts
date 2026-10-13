// Exercises deployed OAuth setup with a temporary Reelform user. Never signs
// into Instagram, exchanges a provider code, or publishes any media.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { OAUTH_COOKIE, stateHash, INSTAGRAM_SCOPES } from "../lib/instagram/security";

const base = new URL(process.env.TEST_APP_URL || "https://www.reelform.io").origin;
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const email = `qa-instagram-connect-${randomUUID()}@example.invalid`;
const password = `Aa9!${randomUUID()}`;
const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
if (error) throw new Error("Could not create temporary test account.");
const owner = data.user.id;
try {
  const login = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { Origin: base, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(login.status, 200, "Temporary account must sign in");
  const cookie = login.headers.getSetCookie().map((v) => v.split(";")[0]).join("; ");
  assert(cookie, "Login must issue a session cookie");
  const upgraded = await db.from("rf_accounts").update({ plan: "pro", paid_until: new Date(Date.now() + 86400000).toISOString() }).eq("user_id", owner);
  assert.equal(upgraded.error, null);
  const status = await fetch(`${base}/api/instagram`, { headers: { Cookie: cookie } });
  assert.equal(status.status, 200);
  const body = await status.json() as { ready: boolean; connection: unknown; posts: unknown[] };
  assert.equal(body.ready, true, "Deployment must have valid Instagram configuration");
  assert.equal(body.connection, null);
  assert.deepEqual(body.posts, []);
  const connect = await fetch(`${base}/api/instagram/connect`, {
    method: "POST",
    headers: { Cookie: cookie, Origin: base, "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(connect.status, 200, "Connect must accept the configured production origin");
  assert.match(connect.headers.get("cache-control") || "", /no-store/);
  const authorization = await connect.json() as { url: string };
  const url = new URL(authorization.url);
  assert.equal(url.origin, "https://www.instagram.com");
  assert.equal(url.pathname, "/oauth/authorize");
  assert.equal(url.searchParams.get("redirect_uri"), `${base}/api/instagram/callback`);
  assert.match(url.searchParams.get("client_id") || "", /^\d+$/);
  assert.deepEqual(url.searchParams.get("scope")?.split(",").sort(), [...INSTAGRAM_SCOPES].sort());
  const state = url.searchParams.get("state")!;
  assert.match(state, /^[\w-]{43}$/);
  const oauthCookie = connect.headers.getSetCookie().find((v) => v.startsWith(`${OAUTH_COOKIE}=`))!;
  assert(oauthCookie, "Connect must issue OAuth browser binding");
  for (const flag of [/; HttpOnly/i, /; Secure/i, /; SameSite=Lax/i, /; Path=\/api\/instagram/i, /; Max-Age=600/i])
    assert.match(oauthCookie, flag);
  assert.equal(oauthCookie.split(";")[0], `${OAUTH_COOKIE}=${state}`);
  const pending = await db.from("rf_instagram_oauth_states").select("user_id,expires_at").eq("state_hash", stateHash(state)).single();
  assert.equal(pending.error, null);
  assert.equal(pending.data!.user_id, owner);
  assert(Date.parse(pending.data!.expires_at) > Date.now());

  // A provider cancellation exercises the callback without provider credentials.
  // A different/missing browser binding must leave the real state untouched.
  const callback = `${base}/api/instagram/callback?state=${encodeURIComponent(state)}&error=access_denied`;
  const wrongBrowser = await fetch(callback, { headers: { Cookie: cookie }, redirect: "manual" });
  assert.equal(wrongBrowser.status, 303);
  assert.equal(new URL(wrongBrowser.headers.get("location")!).searchParams.get("instagram"), "failed");
  const boundCookie = `${cookie}; ${oauthCookie.split(";")[0]}`;
  const cancelled = await fetch(callback, { headers: { Cookie: boundCookie }, redirect: "manual" });
  assert.equal(cancelled.status, 303);
  assert.equal(new URL(cancelled.headers.get("location")!).searchParams.get("instagram"), "cancelled");
  assert.match(cancelled.headers.get("cache-control") || "", /no-store/);
  assert.equal(cancelled.headers.get("referrer-policy"), "no-referrer");
  assert(!cancelled.headers.get("location")!.includes(state));
  const replay = await fetch(callback, { headers: { Cookie: boundCookie }, redirect: "manual" });
  assert.equal(new URL(replay.headers.get("location")!).searchParams.get("instagram"), "failed");
  const remaining = await db.from("rf_instagram_oauth_states").select("state_hash").eq("user_id", owner);
  assert.equal(remaining.error, null);
  assert.deepEqual(remaining.data, []);
  console.log("PASS: deployed configuration, authenticated connection start, exact HTTPS callback, minimal permissions, secure browser cookie, hashed state, cancellation, browser binding, and replay rejection.");
} finally {
  const cleanup = await db.auth.admin.deleteUser(owner);
  assert.equal(cleanup.error, null, "Temporary account cleanup must succeed");
  console.log("Temporary connection-test account and OAuth records removed.");
}
