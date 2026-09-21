import { timingSafeEqual } from "node:crypto";
import { admin, checked } from "@/lib/supabase/server";
import { stripe, billingEnabled } from "@/lib/commerce/stripe";
import {
  fulfillPayment,
  maybeReload,
  syncSubscription,
  fulfillInvoice,
} from "@/lib/commerce/billing";
import { refreshJob } from "@/lib/commerce/jobs";
import { sendJourney, type Journey } from "@/lib/commerce/email";
import { cleanCommunityUploads } from "@/lib/community";
export async function POST(request: Request) {
  const actual = Buffer.from(request.headers.get("authorization") || ""),
    expected = Buffer.from(`Bearer ${process.env.CRON_SECRET || ""}`);
  if (
    !process.env.CRON_SECRET ||
    actual.length !== expected.length ||
    !timingSafeEqual(actual, expected)
  )
    return new Response("Unauthorized", { status: 401 });
  const db = admin(),
    counts = { jobs: 0, payments: 0, accounts: 0, emails: 0, errors: 0 };
  // Bounded batches. Oldest checked records first so new accounts cannot starve.
  const cutoff = new Date(Date.now() - 30000).toISOString();
  const jobs = await checked(
    db
      .from("rf_jobs")
      .select("*")
      .in("status", ["queued", "in_progress"])
      .lt("updated_at", cutoff)
      .order("updated_at")
      .limit(20),
  );
  for (const job of jobs.data || []) {
    try {
      await refreshJob(job);
      counts.jobs++;
    } catch {
      counts.errors++;
    }
  }
  if (billingEnabled()) {
    const orders = await checked(
      db
        .from("rf_orders")
        .select("*")
        .in("status", ["pending", "requires_action"])
        .not("payment_intent_id", "is", null)
        .limit(20),
    );
    for (const o of orders.data || []) {
      try {
        await fulfillPayment(
          await stripe().paymentIntents.retrieve(o.payment_intent_id),
        );
        counts.payments++;
      } catch {
        counts.errors++;
      }
    }
    const accounts = await checked(
      db
        .from("rf_accounts")
        .select("*")
        .not("stripe_subscription_id", "is", null)
        .order("maintenance_at", { nullsFirst: true })
        .limit(20),
    );
    for (const a of accounts.data || []) {
      try {
        const sub = await stripe().subscriptions.retrieve(
          a.stripe_subscription_id,
        );
        await syncSubscription(sub);
        const invoices = await stripe().invoices.list({
          subscription: sub.id,
          status: "paid",
          limit: 3,
        });
        for (const i of invoices.data) await fulfillInvoice(i);
        await maybeReload(a);
        counts.accounts++;
      } catch {
        counts.errors++;
      } finally {
        await checked(
          db
            .from("rf_accounts")
            .update({ maintenance_at: new Date().toISOString() })
            .eq("user_id", a.user_id),
        );
      }
    }
  }
  if (process.env.MARKETING_ENABLED === "true") {
    const accounts = await checked(
      db
        .from("rf_accounts")
        .select("user_id,created_at")
        .eq("marketing_opt_in", true)
        .eq("email_suppressed", false)
        .order("marketing_checked_at", { nullsFirst: true })
        .limit(20),
    );
    for (const a of accounts.data || []) {
      try {
        const age = (Date.now() - new Date(a.created_at).getTime()) / 86400000;
        // Send at most one timely onboarding message per account per run.
        let kind: Journey | null =
          age < 1
            ? "welcome"
            : age >= 2 && age < 4
              ? "first_scene"
              : age >= 7 && age < 9
                ? "inspiration"
                : null;
        if (kind === "first_scene") {
          const completed = await checked(
            db
              .from("rf_jobs")
              .select("id", { head: true, count: "exact" })
              .eq("user_id", a.user_id)
              .eq("status", "completed"),
          );
          if (completed.count) kind = null;
        }
        if (kind && (await sendJourney(a.user_id, kind))) counts.emails++;
      } catch {
        counts.errors++;
      } finally {
        await checked(
          db
            .from("rf_accounts")
            .update({ marketing_checked_at: new Date().toISOString() })
            .eq("user_id", a.user_id),
        );
      }
    }
  }
  try { await cleanCommunityUploads(); } catch { counts.errors++; }
  return Response.json(counts, {
    status: counts.errors ? 207 : 200,
    headers: { "Cache-Control": "no-store" },
  });
}
