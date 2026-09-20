import type Stripe from "stripe";
import { stripe, stripeId } from "@/lib/commerce/stripe";
import {
  fulfillInvoice,
  fulfillPayment,
  syncSubscription,
} from "@/lib/commerce/billing";
import { admin, checked } from "@/lib/supabase/server";
export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature || !process.env.STRIPE_WEBHOOK_SECRET)
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  let event: Stripe.Event;
  try {
    event = await stripe().webhooks.constructEventAsync(
      await request.text(),
      signature,
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch {
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }
  try {
    const db = admin();
    const { data: processed } = await checked(
      db
        .from("rf_webhook_events")
        .select("id")
        .eq("id", event.id)
        .maybeSingle(),
    );
    if (processed) return Response.json({ received: true });
    if (event.type === "invoice.paid")
      await fulfillInvoice(
        await stripe().invoices.retrieve(event.data.object.id),
      );
    if (event.type.startsWith("customer.subscription."))
      await syncSubscription(
        await stripe().subscriptions.retrieve(
          (event.data.object as Stripe.Subscription).id,
        ),
      );
    if (event.type === "payment_intent.succeeded")
      await fulfillPayment(
        await stripe().paymentIntents.retrieve(event.data.object.id),
      );
    if (
      event.type === "checkout.session.completed" &&
      event.data.object.mode === "payment" &&
      event.data.object.payment_status === "paid"
    ) {
      const pi = stripeId(event.data.object.payment_intent);
      if (pi) await fulfillPayment(await stripe().paymentIntents.retrieve(pi));
    }
    if (event.type === "checkout.session.expired")
      await checked(
        db
          .from("rf_orders")
          .update({ status: "expired" })
          .eq("checkout_id", event.data.object.id)
          .eq("status", "pending"),
      );
    if (
      event.type === "charge.refunded" ||
      event.type === "charge.dispute.created"
    ) {
      const charge =
        event.type === "charge.refunded"
          ? event.data.object
          : await stripe().charges.retrieve(event.data.object.charge as string);
      const customer = stripeId(charge.customer);
      if (customer)
        await checked(
          db
            .from("rf_accounts")
            .update({ billing_hold: true, auto_reload_enabled: false })
            .eq("stripe_customer_id", customer),
        );
    }
    await checked(
      db
        .from("rf_webhook_events")
        .upsert(
          { id: event.id, type: event.type },
          { onConflict: "id", ignoreDuplicates: true },
        ),
    );
    return Response.json({ received: true });
  } catch {
    return Response.json(
      { error: "Payment processing will be retried." },
      { status: 500 },
    );
  }
}
