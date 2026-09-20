import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import {
  fulfillInvoice,
  fulfillPayment,
  maybeReload,
  balances,
} from "../lib/commerce/billing";
import {
  schedulePlanChange,
  pendingPlan,
  releaseSchedule,
} from "../lib/commerce/subscriptions";
import { POST as webhook } from "../app/api/webhooks/stripe/route";
if (!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_"))
  throw new Error("Test mode is required.");
process.env.STRIPE_WEBHOOK_SECRET = `whsec_${randomUUID()}`;
process.env.BILLING_ENABLED = "true";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY),
  db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
async function ok<T extends {data:unknown;error:{message:string}|null}>(q: PromiseLike<T>) {
  const r = await q;
  if (r.error) throw new Error(r.error.message);
  return r.data as NonNullable<T["data"]>;
}
let userId = "",
  customerId = "",
  subscriptionId = "",
  eventId = "";
try {
  const created = await ok(
    db.auth.admin.createUser({
      email: `qa-stripe-${randomUUID()}@example.invalid`,
      password: `aA8!${randomUUID()}`,
      email_confirm: true,
    }),
  );
  userId = created.user!.id;
  const customer = await stripe.customers.create({
    email: created.user!.email,
    metadata: { reelform_user_id: userId, qa: "reelform-commerce" },
  });
  customerId = customer.id;
  const pm = await stripe.paymentMethods.attach("pm_card_visa", {
    customer: customerId,
  });
  await stripe.customers.update(customerId, {
    invoice_settings: { default_payment_method: pm.id },
  });
  await ok(
    db
      .from("rf_accounts")
      .insert({
        user_id: userId,
        email: created.user!.email,
        stripe_customer_id: customerId,
      }),
  );
  const sub = await stripe.subscriptions.create({
    customer: customerId,
    items: [{ price: process.env.STRIPE_PRICE_STARTER! }],
    metadata: { reelform_user_id: userId },
    default_payment_method: pm.id,
  });
  subscriptionId = sub.id;
  const invoice = await stripe.invoices.retrieve(
    typeof sub.latest_invoice === "string"
      ? sub.latest_invoice
      : sub.latest_invoice!.id,
  );
  assert.equal(invoice.status, "paid");
  await Promise.all([fulfillInvoice(invoice), fulfillInvoice(invoice)]);
  assert.equal((await balances(userId)).total, 2000);
  console.log("PASS real Stripe sandbox invoice grants one monthly allowance");
  eventId = `evt_reelform_qa_${randomUUID()}`;
  const payload = JSON.stringify({
    id: eventId,
    object: "event",
    type: "invoice.paid",
    created: Math.floor(Date.now() / 1000),
    data: { object: invoice },
  });
  const sig = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: process.env.STRIPE_WEBHOOK_SECRET,
  });
  for (let i = 0; i < 2; i++) {
    const r = await webhook(
      new Request("http://localhost/api/webhooks/stripe", {
        method: "POST",
        headers: { "stripe-signature": sig },
        body: payload,
      }),
    );
    assert.equal(r.status, 200);
  }
  assert.equal((await balances(userId)).total, 2000);
  assert.equal(
    (
      await webhook(
        new Request("http://localhost/api/webhooks/stripe", {
          method: "POST",
          body: payload,
        }),
      )
    ).status,
    400,
  );
  console.log(
    "PASS signed webhook replay is idempotent; forged webhook rejected",
  );
  await schedulePlanChange(
    sub.id,
    process.env.STRIPE_PRICE_PRO_YEARLY!,
    userId,
  );
  const pending = await pendingPlan(sub.id);
  assert.equal(pending?.name, "Pro");
  assert.equal(pending?.cadence, "year");
  assert.equal(
    (await stripe.subscriptions.retrieve(sub.id)).items.data[0].price.id,
    process.env.STRIPE_PRICE_STARTER,
  );
  await releaseSchedule(sub.id, userId);
  console.log(
    "PASS plan and interval changes schedule for renewal without charging today",
  );
  const order = await ok(
    db
      .from("rf_orders")
      .insert({
        user_id: userId,
        kind: "topup",
        pack: "small",
        credits: 900,
        amount_cents: 1000,
      })
      .select()
      .single(),
  );
  const pi = await stripe.paymentIntents.create({
    customer: customerId,
    payment_method: pm.id,
    amount: 1000,
    currency: "usd",
    confirm: true,
    off_session: true,
    metadata: { reelform_order_id: order.id },
  });
  assert.equal(pi.status, "succeeded");
  await Promise.all([fulfillPayment(pi), fulfillPayment(pi)]);
  assert.equal((await balances(userId)).total, 2900);
  console.log("PASS paid test credit pack is credited exactly once");
  await ok(
    db.from("rf_credit_grants").update({ remaining: 0 }).eq("user_id", userId),
  );
  await ok(
    db
      .from("rf_accounts")
      .update({
        auto_reload_enabled: true,
        auto_reload_cap_cents: 1000,
        auto_reload_consent_at: new Date().toISOString(),
      })
      .eq("user_id", userId),
  );
  const a = await ok(
    db.from("rf_accounts").select("*").eq("user_id", userId).single(),
  );
  const reloadResults = await Promise.all([maybeReload(a), maybeReload(a)]);
  console.log({
    reloadResults,
    status: a.subscription_status,
    paidUntil: a.paid_until,
    enabled: a.auto_reload_enabled,
    hasSubscription: !!a.stripe_subscription_id,
  });
  assert.equal((await balances(userId)).total, 900);
  const paid = await ok(
    db
      .from("rf_orders")
      .select("id")
      .eq("user_id", userId)
      .eq("kind", "auto_reload")
      .eq("status", "paid"),
  );
  assert.equal(paid.length, 1);
  console.log(
    "PASS concurrent automatic reload creates one sandbox charge and one credit grant",
  );
  const checkoutArgs = {
    p_user: userId,
    p_plan: "starter",
    p_cadence: "month",
  };
  const claims = await Promise.all([
    ok(db.rpc("rf_claim_checkout", checkoutArgs)),
    ok(db.rpc("rf_claim_checkout", checkoutArgs)),
  ]);
  assert.equal(claims[0].id, claims[1].id);
  console.log(
    "PASS simultaneous subscription checkout requests share one checkout",
  );
} finally {
  if (subscriptionId) {
    try {
      await releaseSchedule(subscriptionId, userId);
      await stripe.subscriptions.cancel(subscriptionId);
    } catch {}
  }
  if (customerId) await stripe.customers.del(customerId);
  if (userId) await ok(db.auth.admin.deleteUser(userId));
  if (eventId)
    await ok(db.from("rf_webhook_events").delete().eq("id", eventId));
  console.log(
    "Sandbox subscriptions, customers and temporary application accounts cleaned up. No live charges.",
  );
}
