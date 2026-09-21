import { VIDEO_BUCKET } from "@/lib/commerce/video-library";
import { removeUserCommunity } from "@/lib/community";
import { z } from "zod";
import {
  requireUser,
  accountFor,
  admin,
  authClient,
  checked,
  isReelformAdmin,
} from "@/lib/supabase/server";
import { ApiError, errorResponse, readJson, noStore } from "@/lib/http";
import { balances } from "@/lib/commerce/billing";
import { refreshJob } from "@/lib/commerce/jobs";
import { pendingPlan } from "@/lib/commerce/subscriptions";
import { stripe, billingEnabled } from "@/lib/commerce/stripe";
export async function GET(request: Request) {
  try {
    const user = await requireUser(request),
      account = await accountFor(user),
      db = admin();
    const [balance, jobs, ledger, orders] = await Promise.all([
      balances(user.id),
      checked(
        db
          .from("rf_jobs")
          .select(
            "id,user_id,provider_id,status,credits,prompt,resolution,result_url,error,created_at",
          )
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(50),
      ),
      checked(
        db
          .from("rf_credit_ledger")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(100),
      ),
      checked(
        db
          .from("rf_orders")
          .select(
            "id,kind,credits,amount_cents,status,receipt_url,error,created_at",
          )
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(50),
      ),
    ]);
    const refreshed = await Promise.allSettled(
      (jobs.data || []).map(async (job) =>
        ["queued", "in_progress", "completed"].includes(job.status) ? refreshJob(job) : job,
      ),
    );
    const visibleJobs = refreshed.map((r, i) => {
      const job = r.status === "fulfilled" ? r.value : jobs.data![i];
      return { ...job, provider_id: undefined };
    });
    let invoices: unknown[] = [],
      paymentMethod: unknown = null,
      pendingChange: unknown = null,
      billingError = false;
    if (account.stripe_customer_id && process.env.STRIPE_SECRET_KEY) {
      try {
        const api = stripe();
        const [list, customer] = await Promise.all([
          api.invoices.list({
            customer: account.stripe_customer_id,
            limit: 24,
          }),
          api.customers.retrieve(account.stripe_customer_id, {
            expand: ["invoice_settings.default_payment_method"],
          }),
        ]);
        if (account.stripe_subscription_id)
          pendingChange = await pendingPlan(account.stripe_subscription_id);
        invoices = list.data.map((i) => ({
          id: i.id,
          number: i.number,
          amount: i.amount_paid || i.amount_due,
          currency: i.currency,
          status: i.status,
          created: i.created,
          pdf: i.invoice_pdf,
          url: i.hosted_invoice_url,
        }));
        if (!customer.deleted) {
          let method = customer.invoice_settings.default_payment_method;
          if (!method && account.stripe_subscription_id) {
            const s = await api.subscriptions.retrieve(
              account.stripe_subscription_id,
              { expand: ["default_payment_method"] },
            );
            method = s.default_payment_method;
          }
          if (method && typeof method !== "string" && method.card)
            paymentMethod = {
              brand: method.card.brand,
              last4: method.card.last4,
              month: method.card.exp_month,
              year: method.card.exp_year,
            };
        }
      } catch {
        billingError = true;
      }
    }
    return noStore({
      account: {
        ...account,
        stripe_customer_id: undefined,
        stripe_subscription_id: undefined,
        stripe_updated_at: undefined,
      },
      balance,
      jobs: visibleJobs,
      ledger: ledger.data,
      orders: orders.data,
      invoices,
      paymentMethod,
      pendingChange,
      billingError,
      isAdmin: isReelformAdmin(user),
      billingReady: billingEnabled(),
      testMode: process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_") || false,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function PATCH(request: Request) {
  try {
    const user = await requireUser(request);
    await accountFor(user);
    const body = await readJson(request);
    const db = admin();
    if (body.action === "profile") {
      const full_name = z.string().trim().min(1).max(100).parse(body.name);
      await checked(
        db.from("rf_accounts").update({ full_name }).eq("user_id", user.id),
      );
    } else if (body.action === "marketing") {
      const enabled = z.boolean().parse(body.enabled);
      await checked(
        db
          .from("rf_accounts")
          .update({
            marketing_opt_in: enabled,
            marketing_consent_source: "account_settings_v1",
            ...(enabled
              ? {
                  marketing_consent_at: new Date().toISOString(),
                  marketing_unsubscribed_at: null,
                }
              : { marketing_unsubscribed_at: new Date().toISOString() }),
          })
          .eq("user_id", user.id),
      );
    } else if (body.action === "disable-reload") {
      await checked(
        db
          .from("rf_accounts")
          .update({ auto_reload_enabled: false })
          .eq("user_id", user.id),
      );
    } else if (body.action === "password" || body.action === "email") {
      const client = await authClient();
      const { error: reauth } = await client.auth.signInWithPassword({
        email: user.email!,
        password: z.string().min(1).max(128).parse(body.currentPassword),
      });
      if (reauth)
        throw new ApiError("Your current password is incorrect.", 403);
      const change =
        body.action === "password"
          ? { password: z.string().min(10).max(128).parse(body.password) }
          : { email: z.string().email().max(254).parse(body.email) };
      const { error } = await client.auth.updateUser(change);
      if (error)
        throw new ApiError(
          "This change could not be saved. Check the details and try again.",
        );
      if (body.action === "password")
        await client.auth.signOut({ scope: "others" });
      return noStore({
        message:
          body.action === "email"
            ? "Check your inbox to confirm your new email address."
            : "Password changed. Other sessions were signed out.",
      });
    } else throw new ApiError("Unknown account setting.");
    return noStore({ ok: true });
  } catch (error) {
    return errorResponse(
      error instanceof z.ZodError
        ? new ApiError("Check your account details.")
        : error,
    );
  }
}
export async function DELETE(request: Request) {
  try {
    const user = await requireUser(request);
    const account = await accountFor(user);
    const body = await readJson(request);
    if (body.confirmation !== "DELETE")
      throw new ApiError("Type DELETE to confirm permanent account deletion.");
    const client = await authClient();
    const { error } = await client.auth.signInWithPassword({
      email: user.email!,
      password: z.string().min(1).max(128).parse(body.password),
    });
    if (error) throw new ApiError("Your password is incorrect.", 403);
    if (account.stripe_subscription_id) {
      const sub = await stripe().subscriptions.retrieve(
        account.stripe_subscription_id,
      );
      if (sub.status !== "canceled")
        await stripe().subscriptions.cancel(sub.id);
    }
    await checked(
      admin()
        .from("rf_accounts")
        .update({
          auto_reload_enabled: false,
          marketing_opt_in: false,
          billing_hold: true,
        })
        .eq("user_id", user.id),
    );
    await removeUserCommunity(user.id);
    // Remove private creation files before deleting the owning account.
    while (true) {
      const { data: files, error: listError } = await admin().storage.from(VIDEO_BUCKET).list(user.id, { limit: 100 });
      if (listError) throw new ApiError("Your saved videos could not be removed. Please try deleting your account again.", 503);
      if (!files?.length) break;
      const { error: removeError } = await admin().storage.from(VIDEO_BUCKET).remove(files.map(file => `${user.id}/${file.name}`));
      if (removeError) throw new ApiError("Your saved videos could not be removed. Please try deleting your account again.", 503);
    }
    await client.auth.signOut({ scope: "global" });
    const { error: deleted } = await admin().auth.admin.deleteUser(user.id);
    if (deleted)
      throw new ApiError(
        "Deletion could not finish. Please contact support.",
        503,
      );
    return noStore({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
