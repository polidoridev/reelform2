import Stripe from "stripe";
import { readFileSync, writeFileSync } from "node:fs";
import { PLANS, TOPUPS } from "../lib/commerce/pricing";
const key = process.env.STRIPE_SECRET_KEY;
if (!key?.startsWith("sk_test_"))
  throw new Error("This setup script is restricted to Stripe test mode.");
const stripe = new Stripe(key);
const values: Record<string, string> = {};
for (const plan of PLANS) {
  const monthly = await stripe.prices.retrieve(process.env[plan.monthlyEnv]!);
  if (monthly.unit_amount !== plan.monthly * 100 || monthly.currency !== "usd")
    throw new Error(`Unexpected existing price for ${plan.name}`);
  const product =
    typeof monthly.product === "string" ? monthly.product : monthly.product.id;
  const existing = await stripe.prices.list({
    product,
    active: true,
    limit: 100,
  });
  let year = existing.data.find(
    (p) =>
      p.recurring?.interval === "year" &&
      p.unit_amount === plan.yearly * 100 &&
      p.currency === "usd",
  );
  if (!year)
    year = await stripe.prices.create(
      {
        product,
        currency: "usd",
        unit_amount: plan.yearly * 100,
        recurring: { interval: "year" },
        nickname: `${plan.name} annual · monthly credit release`,
        metadata: {
          reelform_plan: plan.id,
          credits_per_month: String(plan.credits),
        },
      },
      { idempotencyKey: `rf-annual-v1:${product}:${plan.yearly}` },
    );
  values[plan.yearlyEnv] = year.id;
  console.log(
    `${plan.name}: $${plan.monthly}/month; $${plan.yearly}/year; ${plan.credits} credits/month`,
  );
}
for (const pack of TOPUPS) {
  const p = await stripe.prices.retrieve(process.env[pack.env]!);
  if (
    p.unit_amount !== pack.price * 100 ||
    p.currency !== "usd" ||
    p.recurring
  ) {
    const product = typeof p.product === "string" ? p.product : p.product.id;
    const all = await stripe.prices.list({ product, active: true, limit: 100 });
    const match =
      all.data.find(
        (x) =>
          x.currency === "usd" &&
          x.unit_amount === pack.price * 100 &&
          !x.recurring,
      ) ||
      (await stripe.prices.create(
        {
          product,
          currency: "usd",
          unit_amount: pack.price * 100,
          metadata: { reelform_pack: pack.id, credits: String(pack.credits) },
        },
        { idempotencyKey: `rf-pack-usd-v1:${pack.id}` },
      ));
    values[pack.env] = match.id;
  }
}
const configurations = await stripe.billingPortal.configurations.list({
  limit: 100,
});
const config = configurations.data.find(
  (c) => c.metadata?.reelform_v2 === "true",
);
const options: Stripe.BillingPortal.ConfigurationCreateParams = {
  business_profile: { headline: "Manage your Reelform subscription" },
  features: {
    customer_update: {
      enabled: true,
      allowed_updates: ["address", "name", "tax_id"],
    },
    invoice_history: { enabled: true },
    payment_method_update: { enabled: true },
    subscription_cancel: {
      enabled: true,
      mode: "at_period_end",
      proration_behavior: "none",
    },
    subscription_update: { enabled: false },
  },
  metadata: { reelform_v2: "true" },
};
const portal = config
  ? await stripe.billingPortal.configurations.update(config.id, options)
  : await stripe.billingPortal.configurations.create(options);
values.STRIPE_PORTAL_CONFIGURATION_ID = portal.id;
let env = readFileSync(".env", "utf8");
for (const [k, v] of Object.entries(values)) {
  const re = new RegExp(`^${k}=.*$`, "m");
  env = re.test(env) ? env.replace(re, `${k}=${v}`) : env + `\n${k}=${v}`;
}
writeFileSync(".env", env + "\n", { mode: 0o600 });
console.log(
  "Test annual prices and customer portal configured. No live products or subscriptions changed.",
);
