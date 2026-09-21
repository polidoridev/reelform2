import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const base = process.env.TEST_APP_URL || "http://localhost:3000";
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
const users: string[] = [];
type Jar = Map<string, string>;
const passwords = new WeakMap<Jar, string>();
async function call(
  path: string,
  jar: Jar = new Map(),
  method = "GET",
  body?: unknown,
  origin = base,
) {
  const r = await fetch(base + path, {
    method,
    redirect: "manual",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  for (const c of r.headers.getSetCookie()) {
    const first = c.split(";")[0],
      at = first.indexOf("=");
    jar.set(first.slice(0, at), first.slice(at + 1));
  }
  return r;
}
async function user() {
  const email = `qa-community-${randomUUID()}@example.invalid`,
    password = `aA8!${randomUUID()}`;
  const created = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { reelform_admin: true },
  });
  if (created.error) throw created.error;
  users.push(created.data.user.id);
  const jar: Jar = new Map();
  passwords.set(jar, password);
  assert.equal(
    (await call("/api/auth/login", jar, "POST", { email, password })).status,
    200,
  );
  return jar;
}
async function draft(jar: Jar, bytes: number) {
  const r = await call("/api/community/upload", jar, "POST", {
    bytes,
    contentType: "video/mp4",
  });
  assert.equal(r.status, 201, await r.clone().text());
  return (await r.json()) as { id: string; uploadUrl: string };
}
try {
  const owner = await user(),
    other = await user();
  const anonymous = new Map<string, string>();
  const video = readFileSync("public/media/alpine.mp4");
  assert.equal(
    (
      await call("/api/community/upload", anonymous, "POST", {
        bytes: video.length,
        contentType: "video/mp4",
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await call(
        "/api/community/upload",
        owner,
        "POST",
        {},
        "https://attacker.example",
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await call("/api/community/upload", owner, "POST", {
        bytes: 52428801,
        contentType: "video/mp4",
      })
    ).status,
    400,
  );
  const post = await draft(owner, video.length);
  assert.equal((await call(`/api/community/${post.id}/video`)).status, 404);
  assert.equal((await call(`/api/community/${post.id}`)).status, 404);
  const upload = await fetch(post.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "video/mp4", "cache-control": "max-age=0" },
    body: video,
  });
  assert.ok(upload.ok, await upload.text());
  const payload = {
    title: "QA community creation",
    creator: "Temporary creator",
    caption: "<script>must remain text</script>",
    aiAssisted: true,
    consent: true,
  };
  assert.equal(
    (
      await call(`/api/community/${post.id}`, owner, "POST", {
        ...payload,
        consent: false,
      })
    ).status,
    400,
  );
  assert.equal(
    (await call(`/api/community/${post.id}`, other, "POST", payload)).status,
    404,
  );
  const publish = await call(
    `/api/community/${post.id}`,
    owner,
    "POST",
    payload,
  );
  assert.equal(publish.status, 200, await publish.text());
  assert.equal(
    (await call(`/api/community/${post.id}`, owner, "POST", payload)).status,
    200,
  );
  const publicPost = (await (
    await call(`/api/community/${post.id}`)
  ).json()) as { post: Record<string, unknown> };
  assert.equal(publicPost.post.creator, payload.creator);
  for (const field of [
    "user_id",
    "email",
    "storage_path",
    "rights_accepted_at",
  ])
    assert.ok(!(field in publicPost.post));
  assert.equal(publicPost.post.canRemove, false);
  const playback = await call(`/api/community/${post.id}/video`);
  assert.equal(playback.status, 302);
  const range = await fetch(playback.headers.get("location")!, {
    headers: { Range: "bytes=0-15" },
  });
  assert.equal(range.status, 206);
  await range.body?.cancel();
  assert.equal(
    (await call(`/api/community/${post.id}`, other, "DELETE")).status,
    404,
  );
  assert.equal(
    (
      await call(
        `/api/community/${post.id}`,
        owner,
        "DELETE",
        undefined,
        "https://attacker.example",
      )
    ).status,
    403,
  );
  assert.equal(
    (await call(`/api/community/${post.id}`, owner, "DELETE")).status,
    200,
  );
  assert.equal((await call(`/api/community/${post.id}/video`)).status, 404);
  assert.equal(
    (await call(`/api/community/${post.id}`, owner, "POST", payload)).status,
    404,
  );
  console.log(
    "PASS verified upload, explicit consent, private drafts, public playback, owner-only removal, forged admin metadata rejected, idempotent publish, withdrawal, and public data minimization",
  );

  const fake = await draft(owner, 32);
  assert.ok(
    (
      await fetch(fake.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": "video/mp4" },
        body: Buffer.alloc(32),
      })
    ).ok,
  );
  assert.equal(
    (await call(`/api/community/${fake.id}`, owner, "POST", payload)).status,
    400,
  );
  assert.equal((await call(`/api/community/${fake.id}/video`)).status, 404);
  const anonDb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  assert.ok((await anonDb.from("rf_community_posts").select("*")).error);
  assert.ok(
    (
      await anonDb.storage
        .from("reelform-community")
        .download(`${users[0]}/${fake.id}.mp4`)
    ).error,
  );
  const blockedUpload = await anonDb.storage
    .from("reelform-community")
    .upload(`${users[0]}/unauthorized.mp4`, video, {
      contentType: "video/mp4",
    });
  assert.ok(blockedUpload.error);
  console.log(
    "PASS disguised non-video rejected; direct anonymous database and storage access denied",
  );
  const attempts = await Promise.all(
    Array.from({ length: 12 }, () =>
      call("/api/community/upload", owner, "POST", {
        bytes: 32,
        contentType: "video/mp4",
      }),
    ),
  );
  assert.equal(attempts.filter((r) => r.status === 201).length, 8);
  assert.equal(attempts.filter((r) => r.status === 429).length, 4);
  console.log("PASS concurrent uploads cannot bypass daily quota");
  const accountPost = await draft(other, video.length);
  assert.ok(
    (
      await fetch(accountPost.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": "video/mp4" },
        body: video,
      })
    ).ok,
  );
  assert.equal(
    (await call(`/api/community/${accountPost.id}`, other, "POST", payload))
      .status,
    200,
  );
  const deletedId = users[1];
  const deletion = await call("/api/account", other, "DELETE", {
    confirmation: "DELETE",
    password: passwords.get(other),
  });
  assert.equal(deletion.status, 200, await deletion.text());
  users.splice(users.indexOf(deletedId), 1);
  assert.equal((await call(`/api/community/${accountPost.id}`)).status, 404);
  assert.ok(
    (
      await db.storage
        .from("reelform-community")
        .info(`${deletedId}/${accountPost.id}.mp4`)
    ).error,
  );
  console.log(
    "PASS account deletion removes community posts and stored videos",
  );
} finally {
  for (const id of users) {
    const { data } = await db.storage
      .from("reelform-community")
      .list(id, { limit: 100 });
    if (data?.length) {
      const { error } = await db.storage
        .from("reelform-community")
        .remove(data.map((f) => `${id}/${f.name}`));
      if (error) throw error;
    }
    const { error } = await db.auth.admin.deleteUser(id);
    if (error) throw error;
  }
  console.log(
    "Temporary community accounts and videos removed. No emails sent.",
  );
}
