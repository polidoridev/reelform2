// Uses temporary Supabase users; Instagram is mocked and no real Reel is posted.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  cancelPost,
  connectionFor,
  disconnectInstagram,
  getPost,
  ownedVideo,
  processPost,
  publicPost,
  reservePost,
  tokenFor,
} from "../lib/instagram/server";
import { decryptToken, encryptToken, stateHash } from "../lib/instagram/security";
Object.assign(process.env, {
  INSTAGRAM_ENABLED: "true",
  INSTAGRAM_APP_ID: "123",
  INSTAGRAM_APP_SECRET: "qa-secret",
  INSTAGRAM_TOKEN_KEY: Buffer.alloc(32, 7).toString("base64"),
  INSTAGRAM_REDIRECT_URI: "https://www.reelform.io/api/instagram/callback",
});
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const users: string[] = [];
const original = globalThis.fetch;
let creates = 0,
  publishes = 0;
let refreshes = 0;
let revoked = false;
async function createUser() {
  const password = `Aa9!${randomUUID()}`;
  const email = `qa-instagram-${randomUUID()}@example.invalid`;
  const { data, error } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  users.push(data.user.id);
  const account = await db
    .from("rf_accounts")
    .insert({ user_id: data.user.id, email, plan: "pro", paid_until: new Date(Date.now() + 86400000).toISOString() });
  if (account.error) throw account.error;
  return { id: data.user.id, email, password };
}
async function check<T extends { error: unknown }>(result: PromiseLike<T>) {
  const r = await result;
  if (r.error) throw r.error;
  return r;
}
try {
  const owner = await createUser(),
    other = await createUser();
  if (process.env.TEST_APP_URL) {
    const base = process.env.TEST_APP_URL;
    const login = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { Origin: base, "Content-Type": "application/json" },
      body: JSON.stringify({ email: owner.email, password: owner.password }),
    });
    assert.equal(login.status, 200);
    const cookie = login.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
    const status = await fetch(`${base}/api/instagram`, {
      headers: { Cookie: cookie },
    });
    assert.equal(status.status, 200);
    const body = (await status.json()) as { ready: boolean };
    assert.equal(
      body.ready,
      false,
      "HTTP test expects Instagram disabled in the dev-server environment",
    );
    assert.equal((await fetch(`${base}/api/instagram`)).status, 401);
    for (const [path, method] of [
      ["/api/instagram", "DELETE"],
      ["/api/instagram/connect", "POST"],
      ["/api/instagram/posts", "POST"],
      [`/api/instagram/posts/${randomUUID()}`, "POST"],
    ]) {
      const blocked = await fetch(base + path, {
        method,
        headers: {
          Cookie: cookie,
          Origin: "https://attacker.invalid",
          "Content-Type": "application/json",
        },
        body: "{}",
      });
      assert.equal(
        blocked.status,
        403,
        `${path} must reject cross-origin writes`,
      );
    }
    await check(db.from("rf_accounts").update({ plan: "starter" }).eq("user_id", owner.id));
    const locked = await fetch(`${base}/api/instagram`, { headers: { Cookie: cookie } });
    assert.equal((await locked.json() as { eligible: boolean }).eligible, false);
    for (const path of ["/api/instagram/connect", "/api/instagram/posts", `/api/instagram/posts/${randomUUID()}`]) {
      const denied = await fetch(base + path, { method: "POST", headers: { Cookie: cookie, Origin: base, "Content-Type": "application/json" }, body: "{}" });
      assert.equal(denied.status, 403, `${path} must enforce the paid plan on the server`);
    }
    await check(db.from("rf_accounts").update({ plan: "pro" }).eq("user_id", owner.id));
    assert.equal((await fetch(`${base}/api/cron/instagram`)).status, 401, "Cron requires its secret");
    const forged = await fetch(`${base}/api/instagram/deauthorize`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "signed_request=forged.request",
    });
    assert.equal(forged.status, 403);
    const callback = await fetch(
      `${base}/api/instagram/callback?state=forged&code=secret-test-code`,
      { redirect: "manual" },
    );
    assert.equal(callback.status, 303);
    assert(!callback.headers.get("location")?.includes("secret-test-code"));
    console.log(
      "PASS: real HTTP authentication, disabled setup, same-origin enforcement, forged deauthorization denial, and safe OAuth error redirect.",
    );
  }
  const job = randomUUID(),
    secondJob = randomUUID();
  await check(
    db.from("rf_jobs").insert(
      [job, secondJob].map((id) => ({
        id,
        user_id: owner.id,
        client_id: randomUUID(),
        credits: 1,
        prompt: "Instagram integration QA",
        resolution: "720p",
        status: "completed",
        result_url: `/api/videos/${id}`,
        input: {},
      })),
    ),
  );
  await check(
    db.from("rf_instagram_connections").insert({
      user_id: owner.id,
      instagram_user_id: "qa-" + randomUUID(),
      app_scoped_id: "qa-app-" + randomUUID(),
      username: "qa_creator",
      token_ciphertext: encryptToken("qa-token", owner.id),
      expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
    }),
  );
  await assert.rejects(ownedVideo(other.id, job), /not found/);
  await assert.rejects(reservePost(other.id, job, "stolen", true), /not found/);
  await assert.rejects(
    reservePost(owner.id, job, "Wrong target", true, false, "other-instagram"),
    /account changed/,
  );
  const attempts = await Promise.all(
    Array.from({ length: 3 }, () =>
      reservePost(owner.id, job, "A caption", true),
    ),
  );
  assert.equal(
    new Set(attempts.map((p) => p.id)).size,
    1,
    "database must deduplicate simultaneous reservations",
  );
  await assert.rejects(getPost(other.id, attempts[0].id), /not found/);
  globalThis.fetch = async (input, init) => {
    const url = new URL(
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input
          : input.url,
    );
    if (url.hostname === "graph.instagram.com") {
      if (url.pathname === "/refresh_access_token") {
        refreshes++;
        return revoked
          ? Response.json({ error: { code: 190, message: "private provider detail" } }, { status: 400 })
          : Response.json({ access_token: "qa-refreshed-token", expires_in: 5184000 });
      }
      if (url.pathname.endsWith("/media_publish")) {
        publishes++;
        return Response.json({ id: "media-qa" });
      }
      if (url.pathname.endsWith("/media")) {
        creates++;
        return Response.json({ id: "container-qa" });
      }
      if (url.pathname.endsWith("/media-qa"))
        return Response.json({
          permalink: "https://www.instagram.com/reel/qa/",
        });
      return Response.json({ status_code: "FINISHED" });
    }
    if (url.pathname.includes("/storage/v1/object/sign/"))
      return Response.json({ signedURL: "/object/sign/qa-video.mp4?token=qa" });
    return original(input, init);
  };
  const expiring = {
    expires_at: new Date(Date.now() + 2 * 86400000).toISOString(),
    refreshed_at: new Date(Date.now() - 2 * 86400000).toISOString(),
  };
  await check(db.from("rf_instagram_connections").update(expiring).eq("user_id", owner.id));
  assert.equal(await tokenFor(owner.id), "qa-refreshed-token");
  const refreshed = (await connectionFor(owner.id))!;
  assert.equal(decryptToken(refreshed.token_ciphertext, owner.id), "qa-refreshed-token");
  assert(Date.parse(refreshed.expires_at) > Date.now() + 50 * 86400000);
  assert.equal(await tokenFor(owner.id), "qa-refreshed-token");
  assert.equal(refreshes, 1, "Fresh tokens must not be refreshed again");
  await check(db.from("rf_instagram_connections").update(expiring).eq("user_id", owner.id));
  revoked = true;
  await assert.rejects(tokenFor(owner.id), /Reconnect/);
  assert.equal((await connectionFor(owner.id))!.reconnect_required, true);
  const before = refreshes;
  await assert.rejects(tokenFor(owner.id), /Reconnect/);
  assert.equal(refreshes, before, "Revoked connections must fail without contacting Meta");
  // Restore only our isolated fixture for the publishing checks below.
  await check(db.from("rf_instagram_connections").update({
    expires_at: refreshed.expires_at,
    refreshed_at: refreshed.refreshed_at,
    reconnect_required: false,
  }).eq("user_id", owner.id));
  revoked = false;
  await Promise.all(attempts.map(processPost));
  assert.equal(creates, 1);
  await check(
    db
      .from("rf_instagram_posts")
      .update({ updated_at: new Date(0).toISOString() })
      .eq("id", attempts[0].id),
  );
  const processing = await getPost(owner.id, attempts[0].id);
  await Promise.all([processPost(processing), processPost(processing)]);
  assert.equal(publishes, 1);
  const published = await getPost(owner.id, processing.id);
  assert.equal(published.status, "published");
  assert.equal(published.permalink, "https://www.instagram.com/reel/qa/");
  for (const privateField of [
    "user_id",
    "instagram_user_id",
    "container_id",
    "revision",
  ])
    assert(!(privateField in publicPost(published)));
  await reservePost(owner.id, job, "changed", false, true);
  assert.equal(
    (await getPost(owner.id, processing.id)).caption,
    "A caption",
    "published requests cannot be retried or overwritten",
  );
  const second = await reservePost(owner.id, secondJob, "Second", true);
  await check(
    db
      .from("rf_instagram_posts")
      .update({ status: "unknown", container_id: "container-qa" })
      .eq("id", second.id),
  );
  assert.equal(
    (await reservePost(owner.id, secondJob, "Second", true, true)).status,
    "unknown",
    "ambiguous outcomes cannot be resubmitted",
  );
  await check(
    db
      .from("rf_instagram_posts")
      .update({ status: "failed" })
      .eq("id", second.id),
  );
  assert.equal(
    (await reservePost(owner.id, secondJob, "Retry caption", false, true))
      .status,
    "queued",
  );
  const scheduled = await reservePost(owner.id, secondJob, "Retry caption", false);
  await cancelPost(owner.id, scheduled.id);
  const future = new Date(Date.now() + 3600000).toISOString();
  const rescheduled = await reservePost(owner.id, secondJob, "Scheduled caption", true, true, undefined, future);
  assert.equal(publicPost(rescheduled).scheduledAt, future);
  const createsBefore = creates;
  await processPost(rescheduled);
  assert.equal(creates, createsBefore, "Future posts cannot create containers");
  await assert.rejects(cancelPost(other.id, scheduled.id), /not found/);
  await assert.rejects(cancelPost(owner.id, published.id), /cannot be cancelled/);
  await check(db.from("rf_accounts").update({ plan: "starter" }).eq("user_id", owner.id));
  await assert.rejects(reservePost(owner.id, secondJob, "Denied", true), /subscription/);
  // Cancellation is available even after a downgrade.
  assert.equal((await cancelPost(owner.id, scheduled.id)).status, "cancelled");
  await check(db.from("rf_accounts").update({ plan: "pro" }).eq("user_id", owner.id));
  const due = await reservePost(owner.id, secondJob, "Due caption", true, true);
  await check(db.from("rf_accounts").update({ paid_until: new Date(0).toISOString() }).eq("user_id", owner.id));
  assert.equal((await processPost(due)).status, "failed");
  assert.equal(creates, createsBefore, "Expired subscriptions cannot prepare videos");
  await check(db.from("rf_accounts").update({ paid_until: new Date(Date.now() + 86400000).toISOString() }).eq("user_id", owner.id));
  await reservePost(owner.id, secondJob, "Retry caption", false, true);
  // Browser roles cannot directly read or mutate even their own Instagram rows.
  const browser = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );
  for (const signedIn of [false, true]) {
    if (signedIn)
      await check(
        browser.auth.signInWithPassword({
          email: owner.email,
          password: owner.password,
        }),
      );
    for (const table of [
      "rf_instagram_connections",
      "rf_instagram_posts",
      "rf_instagram_oauth_states",
    ]) {
      assert(
        (await browser.from(table).select("*")).error,
        `${table} must not be readable`,
      );
      assert(
        (await browser.from(table).delete().eq("user_id", owner.id)).error,
        `${table} must not be directly deletable`,
      );
      assert(
        (
          await browser
            .from(table)
            .update({ user_id: other.id })
            .eq("user_id", owner.id)
        ).error,
        `${table} must not be directly writable`,
      );
      assert(
        (await browser.from(table).insert({ user_id: owner.id })).error,
        `${table} must not be directly insertable`,
      );
    }
  }
  const state = stateHash(randomUUID());
  await check(
    db.from("rf_instagram_oauth_states").insert({
      state_hash: state,
      user_id: owner.id,
      return_path: "/instagram",
      expires_at: new Date(Date.now() + 600000).toISOString(),
    }),
  );
  const consume = () =>
    db
      .from("rf_instagram_oauth_states")
      .delete()
      .eq("state_hash", state)
      .eq("user_id", owner.id)
      .select("state_hash");
  const consumed = await Promise.all([consume(), consume()]);
  assert.equal(
    consumed.reduce((sum, r) => sum + (r.data?.length || 0), 0),
    1,
    "OAuth states are consumed once",
  );
  await disconnectInstagram(owner.id);
  assert.equal(await connectionFor(owner.id), null);
  assert.equal((await getPost(owner.id, second.id)).status, "failed");
  assert.equal((await getPost(owner.id, processing.id)).status, "published");
  console.log(
    "PASS: token refresh and revocation, ownership, concurrent reservations/publishing, safe retry, OAuth replay protection, anonymous/authenticated access denial, disconnect, and private response fields.",
  );
} finally {
  globalThis.fetch = original;
  for (const id of users) await check(db.auth.admin.deleteUser(id));
  console.log("Temporary Instagram QA users and cascading records removed.");
}
