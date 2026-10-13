// Run with: node --import tsx --experimental-test-module-mocks scripts/test-custom-topup.ts
// Stripe sandbox + temporary Supabase user. Never accepts a live payment key.
import assert from "node:assert/strict";
import { mock } from "node:test";
import { randomUUID } from "node:crypto";
import env from "@next/env";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { quoteTopupCredits, TOPUPS } from "../lib/commerce/pricing";
env.loadEnvConfig(process.cwd());
if (!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")) throw new Error("Stripe test mode required.");
process.env.BILLING_ENABLED = "true";
process.env.STRIPE_WEBHOOK_SECRET = `whsec_${randomUUID()}`;
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const server = await import("../lib/supabase/server");
let userId = "", customerId = "";
const sessions: string[] = [];
const eventId = `evt_custom_${randomUUID()}`;
let account: Record<string, unknown>;
let status = "active";
let isAdmin = false;
mock.module("../lib/supabase/server", { namedExports: {
  ...server,
  requireUser: async () => ({ id: userId }),
  accountFor: async () => account,
  isReelformAdmin: () => isAdmin,
} });
// Only subscription eligibility is simulated; checkout, payments, order writes,
// signed webhook handling, reconciliation, and credit grants use real services.
const subMock = mock.method(Object.getPrototypeOf(stripe.subscriptions), "retrieve", async () => ({ status }));
const { POST } = await import("../app/api/billing/[action]/route");
const { POST: webhook } = await import("../app/api/webhooks/stripe/route");
const { balances, reconcileCheckout } = await import("../lib/commerce/billing");
async function ok<T extends { data: unknown; error: { message: string } | null }>(q: PromiseLike<T>) {
  const result = await q;
  if (result.error) throw new Error(result.error.message);
  return result.data as NonNullable<T["data"]>;
}
const checkout = (body: unknown) => POST(new Request("http://localhost/api/billing/topup", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
}), { params: Promise.resolve({ action: "topup" }) });
try {
  const { user } = await ok(db.auth.admin.createUser({ email: `qa-topup-${randomUUID()}@example.invalid`, email_confirm: true }));
  userId = user!.id;
  customerId = (await stripe.customers.create({ metadata: { qa: "custom-topup" } })).id;
  account = { user_id: userId, email: user!.email, stripe_customer_id: customerId,
    stripe_subscription_id: "sub_test_eligibility", paid_until: new Date(Date.now() + 86400000).toISOString() };
  await ok(db.from("rf_accounts").insert({ user_id: userId, email: user!.email, stripe_customer_id: customerId }));
  for (const body of [null, {}, { credits: 950 }, { credits: 20100 }, { credits: "3000" },
    { credits: 3000, amount_cents: 1 }, { pack: "small", credits: 20000 }]) {
    const response = await checkout(body === null ? null : { requestId: randomUUID(), ...body });
    assert.equal(response.status, 400);
  }
  console.log("PASS invalid amounts and client-supplied prices rejected");
  for (const patch of [{ billing_hold: true }, { stripe_subscription_id: null }, { paid_until: null }]) {
    const previous = { ...account }; Object.assign(account, patch);
    assert.equal((await checkout({ credits: 3000, requestId: randomUUID() })).status, 403);
    account = previous;
  }
  status = "past_due";
  assert.equal((await checkout({ credits: 3000, requestId: randomUUID() })).status, 403);
  status = "active";
  isAdmin = true;
  assert.equal((await checkout({ credits: 3000, requestId: randomUUID() })).status, 409);
  isAdmin = false;
  console.log("PASS subscription, billing hold, and admin restrictions");
  const requestId = randomUUID();
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await checkout({ credits: 3000, requestId });
    assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
  }
  const order = await ok(db.from("rf_orders").select("*").eq("id", requestId).single());
  sessions.push(order.checkout_id);
  const session = await stripe.checkout.sessions.retrieve(order.checkout_id);
  assert.equal(session.amount_total, 3053);
  assert.equal(order.credits, 3000); assert.equal(order.amount_cents, 3053); assert.equal(order.pack, "custom");
  const items = await stripe.checkout.sessions.listLineItems(session.id);
  assert.match(items.data[0].description ?? "", /3,000 credits/);
  assert.equal((await checkout({ credits: 3100, requestId })).status, 400);
  assert.equal((await balances(userId)).total, 0);
  console.log("PASS custom Stripe checkout total, credit label, retry, changed-amount rejection, and no unpaid grants");
  for (const pack of TOPUPS) {
    const id = randomUUID();
    const response = await checkout({ credits: pack.credits, requestId: id });
    assert.equal(response.status, 200);
    const row = await ok(db.from("rf_orders").select("checkout_id").eq("id", id).single());
    sessions.push(row.checkout_id);
    const lines = await stripe.checkout.sessions.listLineItems(row.checkout_id);
    assert.equal(lines.data[0].price!.id, process.env[pack.env]);
  }
  console.log("PASS slider preset amounts reuse published Stripe prices");
  const payment = await stripe.paymentIntents.create({ amount: quoteTopupCredits(3000), currency: "usd",
    customer: customerId, payment_method: "pm_card_visa", confirm: true, off_session: true,
    metadata: { reelform_order_id: requestId, reelform_user_id: userId, credits: "3000" } });
  assert.equal(payment.status, "succeeded");
  const payload = JSON.stringify({ id: eventId, object: "event", type: "payment_intent.succeeded",
    created: Math.floor(Date.now() / 1000), data: { object: payment } });
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET! });
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await webhook(new Request("http://localhost/api/webhooks/stripe", {
      method: "POST", headers: { "stripe-signature": signature }, body: payload,
    }));
    assert.equal(response.status, 200, await response.text());
  }
  const lookup = mock.method(Object.getPrototypeOf(stripe.checkout.sessions), "retrieve", async () => ({ ...session,
    status: "complete", payment_status: "paid", payment_intent: payment.id }));
  try {
    assert.deepEqual(await reconcileCheckout(account as never, session.id), { ready: true });
  } finally { lookup.mock.restore(); }
  assert.equal((await balances(userId)).total, 3000);
  const grants = await ok(db.from("rf_credit_grants").select("total,valid_from,expires_at").eq("user_id", userId));
  assert.equal(grants.length, 1); assert.equal(grants[0].total, 3000);
  assert.equal(Date.parse(grants[0].expires_at) - Date.parse(grants[0].valid_from), 90 * 86400000);
  console.log("PASS paid custom order grants exactly 3,000 credits once across signed webhook replay and checkout return, expiring in 90 days");
} finally {
  subMock.mock.restore();
  for (const id of sessions) await stripe.checkout.sessions.expire(id).catch(() => {});
  if (customerId) await stripe.customers.del(customerId);
  if (userId) await db.auth.admin.deleteUser(userId);
  await ok(db.from("rf_webhook_events").delete().eq("id", eventId));
}
