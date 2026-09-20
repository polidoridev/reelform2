import { z } from "zod";
import { requireUser, accountFor, admin, checked, isReelformAdmin } from "@/lib/supabase/server";
import { ApiError, readJson, errorResponse, noStore, appUrl } from "@/lib/http";
import {
  stripe,
  requireBilling,
  validatePrice,
  ensureCustomer,
  portal,
  stripeId,
} from "@/lib/commerce/stripe";
import {
  schedulePlanChange,
  releaseSchedule,
} from "@/lib/commerce/subscriptions";
import { syncSubscription } from "@/lib/commerce/billing";
import { PLANS, TOPUPS } from "@/lib/commerce/pricing";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ action: string }> },
) {
  try {
    const user = await requireUser(request);
    const account = await accountFor(user);
    const { action } = await params;
    const body = await readJson(request);
    if (isReelformAdmin(user) && ["subscribe", "topup", "auto-reload", "change-plan"].includes(action))
      throw new ApiError("Your admin account already includes free Reelform generation. No subscription or credit purchase is needed.", 409);
    requireBilling();
    const api = stripe();
    if (
      account.billing_hold &&
      ["subscribe", "topup", "auto-reload", "change-plan"].includes(action)
    )
      throw new ApiError(
        "Your billing account needs review. Please contact support.",
        403,
      );
    if (action === "change-plan") {
      if (!account.stripe_subscription_id)
        throw new ApiError("Subscribe before changing your plan.");
      const plan = PLANS.find((p) => p.id === body.plan),
        cadence = z.enum(["month", "year"]).parse(body.cadence);
      if (!plan) throw new ApiError("Choose a plan.");
      const price =
        process.env[cadence === "month" ? plan.monthlyEnv : plan.yearlyEnv];
      if (!price) throw new ApiError("This plan is being connected.", 503);
      await validatePrice(
        price,
        cadence === "year" ? plan.yearly : plan.monthly,
        cadence,
      );
      return noStore(
        await schedulePlanChange(
          account.stripe_subscription_id,
          price,
          user.id,
        ),
      );
    }
    if (
      ["cancel-renewal", "resume-renewal", "cancel-change"].includes(action)
    ) {
      if (!account.stripe_subscription_id)
        throw new ApiError("No subscription to update.");
      await releaseSchedule(account.stripe_subscription_id, user.id);
      if (action !== "cancel-change") {
        const sub = await api.subscriptions.update(
          account.stripe_subscription_id,
          { cancel_at_period_end: action === "cancel-renewal" },
        );
        await syncSubscription(sub);
        if (action === "cancel-renewal")
          await checked(
            admin()
              .from("rf_accounts")
              .update({ auto_reload_enabled: false })
              .eq("user_id", user.id),
          );
      }
      return noStore({
        message:
          action === "cancel-renewal"
            ? "Renewal cancelled. Your paid access remains until the end of your billing period."
            : action === "resume-renewal"
              ? "Subscription renewal resumed."
              : "Scheduled plan change cancelled.",
      });
    }
    if (action === "portal") {
      if (!account.stripe_customer_id)
        throw new ApiError("Subscribe first to manage your billing.");
      return noStore({ url: (await portal(account.stripe_customer_id)).url });
    }
    if (action === "cancel-checkout") {
      const { data: pending } = await checked(
        admin()
          .from("rf_checkout_sessions")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle(),
      );
      if (pending?.stripe_session_id) {
        const session = await api.checkout.sessions.retrieve(
          pending.stripe_session_id,
        );
        if (session.status === "open")
          await api.checkout.sessions.expire(session.id);
        await checked(
          admin()
            .from("rf_checkout_sessions")
            .delete()
            .eq("user_id", user.id)
            .eq("id", pending.id),
        );
      }
      return noStore({ ok: true });
    }
    if (action === "subscribe") {
      const plan = PLANS.find((p) => p.id === body.plan);
      const cadence = z.enum(["month", "year"]).parse(body.cadence);
      if (!plan) throw new ApiError("Choose an available plan.");
      const price =
        process.env[cadence === "month" ? plan.monthlyEnv : plan.yearlyEnv];
      if (!price) throw new ApiError("This plan is being connected.", 503);
      await validatePrice(
        price,
        cadence === "year" ? plan.yearly : plan.monthly,
        cadence,
      );
      const customer = await ensureCustomer(account);
      const existing = await api.subscriptions.list({
        customer,
        status: "all",
        limit: 100,
      });
      if (
        existing.data.some(
          (s) => !["canceled", "incomplete_expired"].includes(s.status),
        )
      )
        return noStore({ url: (await portal(customer)).url });
      const { data: pending } = await checked(
        admin().rpc("rf_claim_checkout", {
          p_user: user.id,
          p_plan: plan.id,
          p_cadence: cadence,
        }),
      );
      if (pending.plan !== plan.id || pending.cadence !== cadence)
        throw new ApiError(
          "Another plan checkout is already open. Cancel the pending checkout below before choosing a different plan.",
          409,
        );
      const session = await api.checkout.sessions.create(
        {
          expires_at: Math.floor(new Date(pending.expires_at).getTime() / 1000),
          mode: "subscription",
          customer,
          line_items: [{ price, quantity: 1 }],
          payment_method_types: ["card"],
          client_reference_id: user.id,
          subscription_data: { metadata: { reelform_user_id: user.id } },
          success_url: `${appUrl()}/account?tab=billing&checkout=success`,
          cancel_url: `${appUrl()}/pricing?checkout=cancelled`,
          allow_promotion_codes: false,
          billing_address_collection: "auto",
          custom_text: {
            submit: {
              message: `${plan.credits.toLocaleString()} credits released each month. Unused monthly credits expire. ${cadence === "year" ? "Billed yearly; renews automatically." : "Renews monthly."} Cancel anytime before renewal.`,
            },
          },
        },
        { idempotencyKey: `rf-subscribe:${pending.id}` },
      );
      await checked(
        admin()
          .from("rf_checkout_sessions")
          .update({ stripe_session_id: session.id })
          .eq("user_id", user.id)
          .eq("id", pending.id),
      );
      return noStore({ url: session.url });
    }
    if (action === "topup") {
      const pack = TOPUPS.find((p) => p.id === body.pack);
      if (!pack) throw new ApiError("Choose a credit pack.");
      if (!account.stripe_subscription_id)
        throw new ApiError(
          "An active subscription is needed to buy extra credits.",
          403,
        );
      const sub = await api.subscriptions.retrieve(
        account.stripe_subscription_id,
      );
      if (
        sub.status !== "active" ||
        !account.paid_until ||
        new Date(account.paid_until).getTime() <= Date.now()
      )
        throw new ApiError(
          "An active paid subscription is needed to buy credits.",
          403,
        );
      const id = z.string().uuid().parse(body.requestId);
      let { data: order } = await checked(
        admin()
          .from("rf_orders")
          .select("*")
          .eq("id", id)
          .eq("user_id", user.id)
          .maybeSingle(),
      );
      if (!order) {
        const r = await checked(
          admin()
            .from("rf_orders")
            .insert({
              id,
              user_id: user.id,
              kind: "topup",
              pack: pack.id,
              credits: pack.credits,
              amount_cents: pack.price * 100,
            })
            .select()
            .single(),
        );
        order = r.data;
      }
      if (
        order.pack !== pack.id ||
        order.kind !== "topup" ||
        order.status !== "pending"
      )
        throw new ApiError("Start a new credit purchase.");
      const price = process.env[pack.env];
      if (!price)
        throw new ApiError("This credit pack is being connected.", 503);
      await validatePrice(price, pack.price);
      const session = await api.checkout.sessions.create(
        {
          mode: "payment",
          customer: account.stripe_customer_id,
          line_items: [{ price, quantity: 1 }],
          payment_method_types: ["card"],
          metadata: { reelform_order_id: order.id },
          payment_intent_data: {
            metadata: {
              reelform_order_id: order.id,
              reelform_user_id: user.id,
            },
          },
          invoice_creation: { enabled: true },
          success_url: `${appUrl()}/account?tab=credits&checkout=success`,
          cancel_url: `${appUrl()}/account?tab=credits`,
        },
        { idempotencyKey: `rf-topup:${order.id}` },
      );
      await checked(
        admin()
          .from("rf_orders")
          .update({ checkout_id: session.id })
          .eq("id", order.id),
      );
      return noStore({ url: session.url });
    }
    if (action === "auto-reload") {
      const parsed = z
        .object({
          enabled: z.boolean(),
          pack: z.enum(["small", "medium", "large"]),
          threshold: z.number().int().min(100).max(5000),
          monthlyCap: z.number().int().min(10).max(500),
          consent: z.boolean(),
        })
        .parse(body);
      const pack = TOPUPS.find((p) => p.id === parsed.pack)!;
      if (parsed.enabled) {
        if (!parsed.consent)
          throw new ApiError("Confirm the automatic charge authorization.");
        if (parsed.monthlyCap < pack.price || parsed.threshold >= pack.credits)
          throw new ApiError(
            "Set a cap at least as large as your refill and a threshold below the pack size.",
          );
        if (!account.stripe_subscription_id)
          throw new ApiError("Subscribe before enabling auto-reload.");
        const sub = await api.subscriptions.retrieve(
          account.stripe_subscription_id,
        );
        if (sub.status !== "active" || sub.cancel_at_period_end)
          throw new ApiError(
            "Auto-reload needs an active subscription with renewal enabled.",
          );
        const c = await api.customers.retrieve(account.stripe_customer_id);
        if (
          c.deleted ||
          (!stripeId(sub.default_payment_method) &&
            !stripeId(c.invoice_settings.default_payment_method))
        )
          throw new ApiError("Add a saved payment method in Billing first.");
      }
      await checked(
        admin()
          .from("rf_accounts")
          .update({
            auto_reload_enabled: parsed.enabled,
            auto_reload_pack: parsed.pack,
            auto_reload_threshold: parsed.threshold,
            auto_reload_cap_cents: parsed.monthlyCap * 100,
            ...(parsed.enabled
              ? { auto_reload_consent_at: new Date().toISOString() }
              : {}),
          })
          .eq("user_id", user.id),
      );
      return noStore({ ok: true });
    }
    throw new ApiError("Unknown billing action.", 404);
  } catch (error) {
    if (error instanceof z.ZodError)
      return errorResponse(new ApiError("Please check your billing choices."));
    return errorResponse(error);
  }
}
