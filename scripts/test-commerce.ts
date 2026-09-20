import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { quoteVideo } from "../lib/commerce/pricing";
import { inspectMp4 } from "../lib/commerce/media";
import { readFileSync } from "node:fs";
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);
const userIds: string[] = [];
const password = `QA-${randomUUID()}-aB8!`;
async function ok<
  T extends { data: unknown; error: { message: string } | null },
>(q: PromiseLike<T>) {
  const r = await q;
  if (r.error) throw new Error(r.error.message);
  return r.data as NonNullable<T["data"]>;
}
async function user() {
  const u = (
    await ok(
      db.auth.admin.createUser({
        email: `qa-reelform-${randomUUID()}@example.invalid`,
        password,
        email_confirm: true,
      }),
    )
  ).user!;
  userIds.push(u.id);
  await ok(
    db.from("rf_accounts").insert({
      user_id: u.id,
      email: u.email,
      plan: "studio",
      subscription_status: "active",
      paid_until: new Date(Date.now() + 86400000).toISOString(),
    }),
  );
  return u;
}
async function grant(
  id: string,
  total: number,
  kind = "topup",
  expires_at: string | null = null,
) {
  return await ok(
    db
      .from("rf_credit_grants")
      .insert({
        user_id: id,
        source_id: randomUUID(),
        kind,
        total,
        remaining: total,
        expires_at,
      })
      .select()
      .single(),
  );
}
async function available(id: string) {
  const rows = await ok(
    db.from("rf_credit_grants").select("*").eq("user_id", id),
  );
  const now = new Date().toISOString();
  return rows
    .filter(
      (g: { valid_from: string; expires_at: string | null }) =>
        g.valid_from <= now && (!g.expires_at || g.expires_at > now),
    )
    .reduce((s: number, g: { remaining: number }) => s + g.remaining, 0);
}
const reserve = (id: string, credits: number, client = randomUUID()) =>
  db.rpc("rf_reserve_job", {
    p_user: id,
    p_client: client,
    p_credits: credits,
    p_prompt: "A realistic luxury scene",
    p_resolution: "720p",
    p_input: {},
  });
try {
  const a = await user(),
    b = await user();
  await grant(a.id, 1000);
  await grant(b.id, 400);
  const results = await Promise.all([reserve(a.id, 700), reserve(a.id, 700)]);
  assert.equal(results.filter((r) => !r.error).length, 1);
  assert.equal(await available(a.id), 300);
  console.log("PASS concurrent credit spending cannot overspend");
  const job = results.find((r) => !r.error)!.data;
  await ok(reserve(a.id, 700, job.client_id));
  assert.equal(await available(a.id), 300);
  console.log("PASS duplicate generation request reserves once");
  await Promise.all([
    ok(db.rpc("rf_finish_job", { p_job: job.id, p_status: "failed" })),
    ok(db.rpc("rf_finish_job", { p_job: job.id, p_status: "failed" })),
  ]);
  assert.equal(await available(a.id), 1000);
  console.log("PASS duplicate failure returns credits once");
  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );
  assert.ok(
    (
      await anon.rpc("rf_reserve_job", {
        p_user: a.id,
        p_client: randomUUID(),
        p_credits: 1,
        p_prompt: "x",
        p_resolution: "720p",
        p_input: {},
      })
    ).error,
  );
  await ok(anon.auth.signInWithPassword({ email: b.email!, password }));
  assert.equal(
    (await ok(anon.from("rf_accounts").select("user_id"))).length,
    1,
  );
  assert.equal(
    (await ok(anon.from("rf_credit_grants").select("*").eq("user_id", a.id)))
      .length,
    0,
  );
  assert.ok(
    (
      await anon
        .from("rf_accounts")
        .update({ plan: "studio" })
        .eq("user_id", b.id)
    ).error,
  );
  console.log(
    "PASS RLS isolates users and blocks browser monetary writes/RPCs",
  );
  const start = new Date(Date.now() - 60000),
    end = new Date(start);
  end.setUTCFullYear(end.getUTCFullYear() + 1);
  const invoice = `in_test_${randomUUID()}`;
  const args = {
    p_user: b.id,
    p_invoice: invoice,
    p_plan: "starter",
    p_cadence: "year",
    p_start: start.toISOString(),
    p_end: end.toISOString(),
    p_credits: 2000,
  };
  await Promise.all([
    ok(db.rpc("rf_grant_subscription", args)),
    ok(db.rpc("rf_grant_subscription", args)),
  ]);
  const annual = await ok(
    db
      .from("rf_credit_grants")
      .select("*")
      .eq("user_id", b.id)
      .eq("kind", "subscription"),
  );
  assert.equal(annual.length, 12);
  assert.equal(await available(b.id), 2400);
  console.log(
    "PASS annual billing schedules 12 allowances and releases only current month",
  );
  const o = await ok(
    db
      .from("rf_orders")
      .insert({
        user_id: a.id,
        kind: "topup",
        pack: "small",
        credits: 900,
        amount_cents: 1000,
      })
      .select()
      .single(),
  );
  const pay = { p_order: o.id, p_payment: `pi_test_${randomUUID()}` };
  await Promise.all([
    ok(db.rpc("rf_fulfill_topup", pay)),
    ok(db.rpc("rf_fulfill_topup", pay)),
  ]);
  assert.equal(await available(a.id), 1900);
  console.log("PASS duplicate payment grants top-up once");
  await ok(
    db.from("rf_credit_grants").update({ remaining: 0 }).eq("user_id", a.id),
  );
  await ok(
    db
      .from("rf_accounts")
      .update({
        auto_reload_enabled: true,
        auto_reload_threshold: 200,
        auto_reload_cap_cents: 1000,
        auto_reload_consent_at: new Date().toISOString(),
      })
      .eq("user_id", a.id),
  );
  const claimArgs = {
    p_user: a.id,
    p_pack: "small",
    p_credits: 900,
    p_cents: 1000,
  };
  const claims = await Promise.all([
    ok(db.rpc("rf_claim_reload", claimArgs)),
    ok(db.rpc("rf_claim_reload", claimArgs)),
  ]);
  assert.equal(claims.filter(Boolean).length, 1);
  const reload = claims.find(Boolean);
  await ok(
    db.rpc("rf_fulfill_topup", {
      p_order: reload.id,
      p_payment: `pi_test_${randomUUID()}`,
    }),
  );
  await ok(
    db.from("rf_credit_grants").update({ remaining: 0 }).eq("user_id", a.id),
  );
  assert.equal(await ok(db.rpc("rf_claim_reload", claimArgs)), null);
  console.log(
    "PASS auto-reload claim is unique and monthly spending cap is enforced",
  );
  const expiring = await grant(
    a.id,
    300,
    "subscription",
    new Date(Date.now() + 86400000).toISOString(),
  );
  const lateJob = await ok(reserve(a.id, 300));
  await ok(
    db
      .from("rf_credit_grants")
      .update({ expires_at: new Date(Date.now() - 86400000).toISOString() })
      .eq("id", expiring.id),
  );
  await ok(db.rpc("rf_finish_job", { p_job: lateJob.id, p_status: "failed" }));
  const lateBalance = await ok(db.rpc("rf_balances", { p_user: a.id }));
  assert.equal(lateBalance.total, 300);
  console.log(
    "PASS a failed job crossing monthly expiry receives usable refund credits",
  );
  const q720 = quoteVideo(
    { duration: 5, width: 1920, height: 1080, bytes: 1000 },
    "720p",
  );
  const q480 = quoteVideo(
    { duration: 5, width: 1080, height: 1920, bytes: 1000 },
    "480p",
  );
  assert.equal(q720.credits, 1000);
  assert.equal(q480.credits, 450);
  assert.throws(() =>
    quoteVideo(
      { duration: 31, width: 1920, height: 1080, bytes: 1000 },
      "720p",
    ),
  );
  console.log(
    "PASS cost quote includes input and output durations and rejects out-of-bounds clips",
  );
  const bytes = readFileSync("public/media/yacht.mp4");
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    const match = new Headers(init?.headers)
      .get("range")!
      .match(/bytes=(\d+)-(\d+)/)!;
    const from = +match[1],
      to = +match[2];
    return new Response(bytes.subarray(from, to + 1), {
      status: 206,
      headers: { "Content-Range": `bytes ${from}-${to}/${bytes.length}` },
    });
  };
  try {
    const media = await inspectMp4(
      "https://uploads.test/video.mp4",
      bytes.length,
    );
    assert.ok(media.duration >= 4 && media.duration <= 30 && media.width > 0);
    console.log(
      `PASS server reads actual MP4 metadata (${media.width}×${media.height}, ${media.duration.toFixed(2)}s)`,
    );
  } finally {
    globalThis.fetch = original;
  }
} finally {
  for (const id of userIds) {
    await ok(db.auth.admin.deleteUser(id));
  }
  console.log("Temporary test accounts cleaned up.");
}
