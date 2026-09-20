import type { AccountRow } from "./types";
import type Stripe from "stripe";
import { admin, checked } from "@/lib/supabase/server";
import { ApiError } from "@/lib/http";
import { stripe, stripeId, iso, billingEnabled } from "./stripe";
import { TOPUPS, planByPrice } from "./pricing";
export async function balances(userId: string) {
  // Use the same database clock as reservation and refill decisions.
  const { data } = await checked(
    admin().rpc("rf_balances", { p_user: userId }),
  );
  return data as {
    total: number;
    subscription: number;
    purchased: number;
    nextReset: string | null;
    nextGrant: string | null;
  };
}
export async function syncSubscription(
  sub: Stripe.Subscription,
  eventTime = Math.floor(Date.now() / 1000),
) {
  const customer = stripeId(sub.customer);
  if (!customer) return;
  const { data: account } = await checked(
    admin()
      .from("rf_accounts")
      .select("*")
      .eq("stripe_customer_id", customer)
      .maybeSingle(),
  );
  if (!account) return;
  const mapped = planByPrice(sub.items.data[0]?.price.id || "");
  if (!mapped) return;
  // Never let an old subscription's event overwrite a newer subscription.
  if (
    account.stripe_subscription_id &&
    account.stripe_subscription_id !== sub.id
  ) {
    const current = await stripe().subscriptions.retrieve(
      account.stripe_subscription_id,
    );
    if (!["canceled", "incomplete_expired"].includes(current.status)) return;
  }
  await checked(
    admin()
      .from("rf_accounts")
      .update({
        stripe_subscription_id: sub.id,
        plan: mapped.plan.id,
        cadence: mapped.cadence,
        subscription_status: sub.status,
        cancel_at_period_end: sub.cancel_at_period_end,
        stripe_updated_at: eventTime,
        ...(["canceled", "unpaid", "past_due"].includes(sub.status)
          ? { auto_reload_enabled: false }
          : {}),
      })
      .eq("user_id", account.user_id)
      .lte("stripe_updated_at", eventTime),
  );
}
export async function fulfillInvoice(invoice: Stripe.Invoice) {
  if (
    invoice.status !== "paid" ||
    !["subscription_create", "subscription_cycle"].includes(
      invoice.billing_reason || "",
    )
  )
    return;
  const subscriptionId = stripeId(
    invoice.parent?.subscription_details?.subscription,
  );
  if (!subscriptionId) return;
  const sub = await stripe().subscriptions.retrieve(subscriptionId);
  const customer = stripeId(sub.customer);
  if (!customer) return;
  const { data: account } = await checked(
    admin()
      .from("rf_accounts")
      .select("*")
      .eq("stripe_customer_id", customer)
      .maybeSingle(),
  );
  if (!account) return;
  if (sub.metadata.reelform_user_id !== account.user_id) return;
  const line = invoice.lines.data.find(
    (l) =>
      l.pricing?.price_details?.price &&
      planByPrice(stripeId(l.pricing.price_details.price) || ""),
  );
  const mapped = line
    ? planByPrice(stripeId(line.pricing?.price_details?.price) || "")
    : null;
  if (!mapped || !line?.period) return;
  await syncSubscription(sub);
  await checked(
    admin().rpc("rf_grant_subscription", {
      p_user: account.user_id,
      p_invoice: invoice.id,
      p_plan: mapped.plan.id,
      p_cadence: mapped.cadence,
      p_start: iso(line.period.start),
      p_end: iso(line.period.end),
      p_credits: mapped.plan.credits,
    }),
  );
}
export async function fulfillPayment(pi: Stripe.PaymentIntent) {
  if (
    pi.status !== "succeeded" ||
    pi.currency !== "usd" ||
    !pi.metadata.reelform_order_id
  )
    return;
  const { data: order } = await checked(
    admin()
      .from("rf_orders")
      .select("*")
      .eq("id", pi.metadata.reelform_order_id)
      .maybeSingle(),
  );
  if (!order) return;
  const { data: account } = await checked(
    admin()
      .from("rf_accounts")
      .select("stripe_customer_id")
      .eq("user_id", order.user_id)
      .single(),
  );
  if (
    stripeId(pi.customer) !== account?.stripe_customer_id ||
    pi.amount_received !== order.amount_cents
  )
    throw new ApiError("Payment does not match this order.", 409);
  let receipt: string | null = null;
  const chargeId = stripeId(pi.latest_charge);
  if (chargeId)
    receipt = (await stripe().charges.retrieve(chargeId)).receipt_url;
  await checked(
    admin().rpc("rf_fulfill_topup", {
      p_order: order.id,
      p_payment: pi.id,
      p_receipt: receipt,
    }),
  );
}
export async function maybeReload(account: AccountRow) {
  if (
    !billingEnabled() ||
    !account.auto_reload_enabled ||
    !account.stripe_subscription_id
  )
    return null;
  const pack = TOPUPS.find((p) => p.id === account.auto_reload_pack);
  if (!pack) return null;
  // Re-check Stripe: stale webhook state must never authorize a charge.
  const sub = await stripe().subscriptions.retrieve(
    account.stripe_subscription_id,
  );
  if (sub.status !== "active" || sub.cancel_at_period_end) return null;
  const customer = await stripe().customers.retrieve(
    account.stripe_customer_id!,
  );
  if (customer.deleted) return null;
  const method =
    stripeId(sub.default_payment_method) ||
    stripeId(customer.invoice_settings.default_payment_method);
  if (!method) return null;
  const { data: order } = await checked(
    admin().rpc("rf_claim_reload", {
      p_user: account.user_id,
      p_pack: pack.id,
      p_credits: pack.credits,
      p_cents: pack.price * 100,
    }),
  );
  if (!order) return null;
  try {
    const pi = await stripe().paymentIntents.create(
      {
        amount: order.amount_cents,
        currency: "usd",
        customer: account.stripe_customer_id!,
        payment_method: method,
        off_session: true,
        confirm: true,
        description: `Reelform auto-reload · ${pack.credits.toLocaleString()} credits`,
        metadata: {
          reelform_order_id: order.id,
          reelform_user_id: account.user_id,
        },
      },
      { idempotencyKey: `rf-reload:${order.id}` },
    );
    await checked(
      admin()
        .from("rf_orders")
        .update({ payment_intent_id: pi.id })
        .eq("id", order.id),
    );
    if (pi.status === "succeeded") await fulfillPayment(pi);
    return pi.status;
  } catch (error) {
    const e = error as {
      type?: string;
      code?: string;
      payment_intent?: Stripe.PaymentIntent;
    };
    if (e.type === "StripeCardError") {
      const action = e.payment_intent?.status === "requires_action";
      await checked(
        admin()
          .from("rf_orders")
          .update({
            status: action ? "requires_action" : "failed",
            payment_intent_id: e.payment_intent?.id,
            error: action
              ? "Your bank needs payment confirmation. Use a manual top-up."
              : "Your card could not be charged. Update your payment method.",
          })
          .eq("id", order.id),
      );
      await checked(
        admin()
          .from("rf_accounts")
          .update({ auto_reload_enabled: false })
          .eq("user_id", account.user_id),
      );
      return action ? "requires_action" : "failed";
    }
    // Unknown outcomes remain pending: never issue a second charge to guess.
    throw error;
  }
}
