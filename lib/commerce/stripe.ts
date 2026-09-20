import type { AccountRow } from "./types";
import Stripe from "stripe";
import { ApiError, appUrl } from "@/lib/http";
import { admin, checked } from "@/lib/supabase/server";
export function stripe() {
  if (!process.env.STRIPE_SECRET_KEY)
    throw new ApiError("Payments are not connected yet.", 503);
  return new Stripe(process.env.STRIPE_SECRET_KEY, { maxNetworkRetries: 2 });
}
export function billingEnabled() {
  return (
    process.env.BILLING_ENABLED === "true" &&
    Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET)
  );
}
export function requireBilling() {
  if (!billingEnabled())
    throw new ApiError(
      "Checkout is being connected. Please check back soon.",
      503,
    );
}
export const iso = (seconds: number) => new Date(seconds * 1000).toISOString();
export function stripeId(value: string | { id: string } | null | undefined) {
  return typeof value === "string" ? value : value?.id;
}
export async function ensureCustomer(account: AccountRow) {
  if (account.stripe_customer_id) return account.stripe_customer_id as string;
  const customer = await stripe().customers.create(
    {
      email: account.email,
      name: account.full_name || undefined,
      metadata: { reelform_user_id: account.user_id },
    },
    { idempotencyKey: `rf-customer:${account.user_id}` },
  );
  await checked(
    admin()
      .from("rf_accounts")
      .update({ stripe_customer_id: customer.id })
      .eq("user_id", account.user_id),
  );
  return customer.id;
}
export async function portal(customer: string) {
  return stripe().billingPortal.sessions.create({
    customer,
    configuration: process.env.STRIPE_PORTAL_CONFIGURATION_ID || undefined,
    return_url: `${appUrl()}/account?tab=billing`,
  });
}

export async function validatePrice(
  id: string,
  amount: number,
  cadence?: "month" | "year",
) {
  const price = await stripe().prices.retrieve(id);
  if (
    !price.active ||
    price.currency !== "usd" ||
    price.unit_amount !== amount * 100 ||
    (cadence
      ? price.recurring?.interval !== cadence ||
        price.recurring.interval_count !== 1
      : !!price.recurring)
  )
    throw new ApiError(
      "This price is being updated. Please contact support.",
      503,
    );
  return price;
}
