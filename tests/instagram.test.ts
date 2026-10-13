import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  decryptToken,
  encryptToken,
  instagramConfigured,
  instagramConfig,
  matchesState,
  newState,
  verifySignedRequest,
} from "../lib/instagram/security";
import {
  authorizationUrl,
  exchangeCode,
  graph,
  refreshToken,
  safePermalink,
} from "../lib/instagram/api";
import {
  advancePost,
  type InstagramPost,
  type PublishDependencies,
  type PostPatch,
} from "../lib/instagram/publishing";
import { authDestination } from "../lib/auth-destination";

Object.assign(process.env, {
  INSTAGRAM_ENABLED: "true",
  INSTAGRAM_APP_ID: "123",
  INSTAGRAM_APP_SECRET: "test-secret",
  INSTAGRAM_TOKEN_KEY: Buffer.alloc(32, 4).toString("base64"),
  INSTAGRAM_REDIRECT_URI: "https://www.reelform.io/api/instagram/callback",
  INSTAGRAM_API_VERSION: "v25.0",
});
function fixture(status: InstagramPost["status"] = "queued") {
  let row: InstagramPost = {
    id: "post",
    user_id: "owner",
    job_id: "job",
    instagram_user_id: "123",
    username: "creator",
    caption: "My Reel",
    share_to_feed: true,
    status,
    container_id: status === "queued" ? null : "container",
    media_id: null,
    permalink: null,
    error: null,
    revision: 0,
    scheduled_at: null,
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
  };
  let creates = 0,
    publishes = 0;
  const deps: PublishDependencies = {
    eligible: async () => true,
    change: async (expected, patch: PostPatch) => {
      if (row.revision !== expected.revision) return null;
      row = {
        ...row,
        ...patch,
        revision: row.revision + 1,
        updated_at: new Date().toISOString(),
      };
      return row;
    },
    token: async () => "private-token",
    video: async () => "https://storage.example/signed.mp4",
    create: async () => {
      creates++;
      return "container";
    },
    status: async () => "FINISHED",
    publish: async () => {
      publishes++;
      return "media";
    },
    permalink: async () => "https://www.instagram.com/reel/example/",
  };
  return {
    deps,
    row: () => row,
    creates: () => creates,
    publishes: () => publishes,
  };
}
test("encrypted credentials are randomized, authenticated, and bound to their Reelform owner", () => {
  const first = encryptToken("secret-token", "alice"),
    second = encryptToken("secret-token", "alice");
  assert.notEqual(first, second);
  assert(!first.includes("secret-token"));
  assert.equal(decryptToken(first, "alice"), "secret-token");
  assert.throws(() => decryptToken(first, "bob"));
  const parts = first.split(".");
  parts[2] = Buffer.alloc(16).toString("base64url");
  assert.throws(() => decryptToken(parts.join("."), "alice"));
});
test("OAuth state requires a matching browser cookie and authorization only requests the two needed permissions", () => {
  const state = newState();
  assert(matchesState(state, state));
  assert(!matchesState(state, newState()));
  assert(!matchesState(null, state));
  assert(!matchesState(state, undefined));
  const url = new URL(authorizationUrl(state));
  assert.equal(url.origin, "https://www.instagram.com");
  assert.equal(url.searchParams.get("state"), state);
  assert.equal(
    url.searchParams.get("scope"),
    "instagram_business_basic,instagram_business_content_publish",
  );
});
test("missing configuration disables publishing", () => {
  const key = process.env.INSTAGRAM_TOKEN_KEY;
  process.env.INSTAGRAM_TOKEN_KEY = "short";
  try {
    assert.equal(instagramConfigured(), false);
  } finally {
    process.env.INSTAGRAM_TOKEN_KEY = key;
  }
});
test("deauthorization requires a genuine Meta HMAC", () => {
  const payload = Buffer.from(
    JSON.stringify({ algorithm: "HMAC-SHA256", user_id: "123" }),
  ).toString("base64url");
  const signature = createHmac("sha256", "test-secret")
    .update(payload)
    .digest("base64url");
  assert.equal(verifySignedRequest(`${signature}.${payload}`), "123");
  assert.throws(() => verifySignedRequest(`${signature}.${payload}x`));
});
test("auth return paths preserve a selected video without enabling open redirects", () => {
  const path = "/instagram?generation=12345678-1234-1234-1234-123456789012";
  assert.equal(authDestination(path), path);
  assert.equal(authDestination("/instagram"), "/instagram");
  for (const bad of [
    "//evil.example",
    "/instagram?next=https://evil.example",
    `${path}&next=evil`,
  ])
    assert.equal(authDestination(bad), "/account");
});
test("simultaneous requests create exactly one container", async () => {
  const f = fixture();
  const original = f.row();
  await Promise.all([
    advancePost(original, f.deps),
    advancePost(original, f.deps),
    advancePost(original, f.deps),
  ]);
  assert.equal(f.creates(), 1);
  assert.equal(f.row().status, "processing");
  assert.equal(f.publishes(), 0);
});
test("simultaneous polling publishes once and records the permalink", async () => {
  const f = fixture("processing");
  const original = f.row();
  await Promise.all([
    advancePost(original, f.deps),
    advancePost(original, f.deps),
  ]);
  assert.equal(f.publishes(), 1);
  assert.equal(f.row().status, "published");
  assert.equal(f.row().permalink, "https://www.instagram.com/reel/example/");
});
test("an ambiguous publish timeout is never retried even when the container still says FINISHED", async () => {
  const f = fixture("processing");
  let attempts = 0;
  f.deps.publish = async () => {
    attempts++;
    throw new Error("timeout after Instagram received it");
  };
  await advancePost(f.row(), f.deps);
  assert.equal(f.row().status, "unknown");
  await advancePost(f.row(), f.deps, Date.now() + 120000);
  assert.equal(attempts, 1);
  assert.equal(f.row().status, "unknown");
  f.deps.status = async () => "PUBLISHED";
  await advancePost(f.row(), f.deps, Date.now() + 120000);
  assert.equal(f.row().status, "published");
  assert.equal(attempts, 1);
});
test("a process that dies after claiming publishing can only reconcile, never resubmit", async () => {
  const f = fixture("publishing");
  await advancePost(f.row(), f.deps);
  assert.equal(f.publishes(), 0);
  assert.equal(f.row().status, "unknown");
});
test("a failed success-record write cannot cause a duplicate publish", async () => {
  const f = fixture("processing");
  const change = f.deps.change;
  f.deps.change = async (post, patch) => {
    if (patch.status === "published") throw new Error("database timeout");
    return change(post, patch);
  };
  await assert.rejects(advancePost(f.row(), f.deps));
  assert.equal(f.row().status, "publishing");
  f.deps.change = change;
  f.deps.status = async () => "PUBLISHED";
  await advancePost(f.row(), f.deps, Date.now() + 120000);
  assert.equal(f.publishes(), 1);
  assert.equal(f.row().status, "published");
});
test("permalink lookup failure does not undo a published result", async () => {
  const f = fixture("processing");
  f.deps.permalink = async () => {
    throw new Error("rate limit");
  };
  await advancePost(f.row(), f.deps);
  assert.equal(f.row().status, "published");
  assert.equal(f.row().media_id, "media");
});
test("disconnection or missing media prevents container creation", async () => {
  const f = fixture();
  f.deps.token = async () => {
    throw new Error("disconnected");
  };
  await advancePost(f.row(), f.deps);
  assert.equal(f.creates(), 0);
  assert.equal(f.row().status, "failed");
});
test("processing and expired containers never trigger a publish", async () => {
  for (const status of ["IN_PROGRESS", "EXPIRED", "ERROR"]) {
    const f = fixture("processing");
    f.deps.status = async () => status;
    await advancePost(f.row(), f.deps);
    assert.equal(f.publishes(), 0);
    assert.equal(
      f.row().status,
      status === "IN_PROGRESS" ? "processing" : "failed",
    );
  }
});
test("publish polling is bounded to once per minute", async () => {
  const f = fixture("processing");
  f.deps.status = async () => "IN_PROGRESS";
  await advancePost(f.row(), f.deps);
  const revision = f.row().revision;
  await advancePost(f.row(), f.deps);
  assert.equal(f.row().revision, revision);
});
test("graph errors hide upstream secrets and requests never retry automatically", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    calls++;
    assert.equal(new URL(String(url)).origin, "https://graph.instagram.com");
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Bearer token",
    );
    return Response.json(
      { error: { code: 190, message: "sensitive-token" } },
      { status: 400 },
    );
  };
  try {
    await assert.rejects(
      graph("me", "token"),
      (error) =>
        error instanceof Error &&
        /Reconnect/.test(error.message) &&
        !error.message.includes("sensitive"),
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = original;
  }
});
test("OAuth handles Meta's wrapped token response and refuses missing publishing permission", async () => {
  const original = globalThis.fetch;
  let permissions =
    "instagram_business_basic,instagram_business_content_publish";
  globalThis.fetch = async (url) => {
    const target = new URL(String(url));
    if (target.host === "api.instagram.com")
      return Response.json({
        data: [{ access_token: "short", user_id: "1234", permissions }],
      });
    if (target.pathname === "/access_token")
      return Response.json({ access_token: "long", expires_in: 5184000 });
    return Response.json({
      user_id: "5678",
      username: "creator",
      account_type: "MEDIA_CREATOR",
    });
  };
  try {
    const result = await exchangeCode("code");
    assert.equal(result.app_scoped_id, "1234");
    assert.equal(result.instagram_user_id, "5678");
    permissions = "instagram_business_basic";
    await assert.rejects(exchangeCode("code"), /Allow both/);
  } finally {
    globalThis.fetch = original;
  }
});
test("provider links can only point at Instagram", () => {
  assert.equal(safePermalink("https://evil.example/reel/test"), null);
  assert.equal(safePermalink("javascript:alert(1)"), null);
  assert.equal(
    safePermalink("https://www.instagram.com/reel/test/"),
    "https://www.instagram.com/reel/test/",
  );
});

test("malformed browser states fail closed without throwing", () => {
  const state = newState();
  assert.equal(matchesState(state, "é".repeat(43)), false);
  assert.equal(matchesState(state, " ".repeat(43)), false);
});

test("truncated GCM authentication tags cannot decrypt stored credentials", () => {
  const parts = encryptToken("secret-token", "alice").split(".");
  parts[2] = Buffer.from(parts[2], "base64url").subarray(0, 4).toString("base64url");
  assert.throws(() => decryptToken(parts.join("."), "alice"), /Reconnect/);
});

test("invalid callback configuration produces a safe unavailable error", () => {
  const original = process.env.INSTAGRAM_REDIRECT_URI;
  try {
    for (const uri of ["invalid", "http://reelform.io/api/instagram/callback", "https://reelform.io/api/instagram/callback?next=evil"]) {
      process.env.INSTAGRAM_REDIRECT_URI = uri;
      assert.throws(instagramConfig, { status: 503 });
      assert.equal(instagramConfigured(), false);
    }
  } finally {
    process.env.INSTAGRAM_REDIRECT_URI = original;
  }
});

test("signed deauthorization rejects malformed payloads and imprecise account IDs", () => {
  for (const body of ["{", "null", JSON.stringify({ algorithm: "HMAC-SHA256", user_id: Number.MAX_SAFE_INTEGER + 1 }), JSON.stringify({ algorithm: "HMAC-SHA256", user_id: [123] })]) {
    const payload = Buffer.from(body).toString("base64url");
    const signature = createHmac("sha256", "test-secret").update(payload).digest("base64url");
    assert.throws(() => verifySignedRequest(`${signature}.${payload}`), { status: 403 });
  }
});

test("container errors after an uncertain publish never enable a retry", async () => {
  for (const phase of ["publishing", "unknown"] as const) {
    for (const status of ["ERROR", "EXPIRED"]) {
      const f = fixture(phase);
      f.deps.status = async () => status;
      await advancePost(f.row(), f.deps);
      assert.equal(f.row().status, "unknown");
      assert.equal(f.publishes(), 0);
    }
  }
});

test("token refresh rejects malformed credentials and unusable expiry", async () => {
  const original = globalThis.fetch;
  try {
    for (const token of [
      { access_token: { secret: "value" }, expires_in: 5184000 },
      { access_token: "  ", expires_in: 5184000 },
      { access_token: "token", expires_in: 1e100 },
      { access_token: "token", expires_in: -1 },
    ]) {
      globalThis.fetch = async () => Response.json(token);
      await assert.rejects(refreshToken("old"), /incomplete connection/);
    }
  } finally {
    globalThis.fetch = original;
  }
});

test("OAuth never saves a profile ID rounded by JSON number parsing", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.hostname === "api.instagram.com")
      return Response.json({ access_token: "short", user_id: "123", permissions: ["instagram_business_basic", "instagram_business_content_publish"] });
    if (url.pathname === "/access_token")
      return Response.json({ access_token: "long", expires_in: 5184000 });
    return Response.json({ user_id: Number.MAX_SAFE_INTEGER + 1, username: "creator", account_type: "BUSINESS" });
  };
  try {
    await assert.rejects(exchangeCode("code"), /Creator or Business/);
  } finally {
    globalThis.fetch = original;
  }
});

test("future schedules do not create containers or touch credentials", async () => {
  const f = fixture();
  const post = { ...f.row(), scheduled_at: new Date(Date.now() + 3600000).toISOString() };
  f.deps.token = async () => { throw new Error("Must not access credentials early"); };
  assert.equal(await advancePost(post, f.deps), post);
  assert.equal(f.creates(), 0);
  assert.equal(f.row().revision, 0);
});

test("due schedules advance once even with competing workers", async () => {
  const f = fixture();
  const post = { ...f.row(), scheduled_at: new Date(100000).toISOString() };
  await Promise.all([advancePost(post, f.deps, 100000), advancePost(post, f.deps, 100000)]);
  assert.equal(f.creates(), 1);
  assert.equal(f.row().status, "processing");
});

test("expired subscriptions block both preparation and publication", async () => {
  for (const status of ["queued", "processing"] as const) {
    const f = fixture(status);
    f.deps.eligible = async () => false;
    await advancePost(f.row(), f.deps);
    assert.equal(f.row().status, "failed");
    assert.match(f.row().error!, /subscription ended/);
    assert.equal(f.creates(), 0);
    assert.equal(f.publishes(), 0);
  }
});

test("downgrade still reconciles uncertain publication without submitting twice", async () => {
  const f = fixture("unknown");
  f.deps.eligible = async () => false;
  f.deps.status = async () => "PUBLISHED";
  await advancePost(f.row(), f.deps);
  assert.equal(f.row().status, "published");
  assert.equal(f.publishes(), 0);
});

test("cancelled posts are terminal and never use Instagram", async () => {
  const f = fixture("cancelled");
  await advancePost(f.row(), f.deps);
  assert.equal(f.row().status, "cancelled");
  assert.equal(f.row().revision, 0);
  assert.equal(f.creates(), 0);
  assert.equal(f.publishes(), 0);
});
