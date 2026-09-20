import { stripe, stripeId, iso } from "./stripe";
import { ApiError } from "@/lib/http";
import { planByPrice } from "./pricing";
export async function schedulePlanChange(
  subscriptionId: string,
  price: string,
  userId: string,
) {
  const api = stripe(),
    sub = await api.subscriptions.retrieve(subscriptionId);
  if (
    sub.metadata.reelform_user_id !== userId ||
    sub.status !== "active" ||
    sub.cancel_at_period_end
  )
    throw new ApiError("Resume an active subscription before changing plans.");
  const item = sub.items.data[0];
  if (!item || sub.items.data.length !== 1)
    throw new ApiError("Contact support to change this subscription.");
  if (item.price.id === price)
    throw new ApiError("You are already on this plan and billing period.");
  const mapped = planByPrice(price);
  if (!mapped) throw new ApiError("This plan is not available.");
  const id = stripeId(sub.schedule);
  const schedule = id
    ? await api.subscriptionSchedules.retrieve(id)
    : await api.subscriptionSchedules.create(
        { from_subscription: sub.id },
        { idempotencyKey: `rf-schedule:${sub.id}:${item.current_period_end}` },
      );
  if (
    schedule.metadata?.reelform_user_id &&
    schedule.metadata?.reelform_user_id !== userId
  )
    throw new ApiError("Contact support to update this schedule.");
  await api.subscriptionSchedules.update(schedule.id, {
    end_behavior: "release",
    proration_behavior: "none",
    metadata: { reelform_user_id: userId },
    phases: [
      {
        start_date:
          schedule.current_phase?.start_date || item.current_period_start,
        end_date: item.current_period_end,
        items: [{ price: item.price.id, quantity: 1 }],
        proration_behavior: "none",
      },
      {
        start_date: item.current_period_end,
        duration: { interval: mapped.cadence, interval_count: 1 },
        items: [{ price, quantity: 1 }],
        proration_behavior: "none",
        metadata: { reelform_user_id: userId },
      },
    ],
  });
  return {
    message: `Your ${mapped.plan.name} ${mapped.cadence === "year" ? "yearly" : "monthly"} plan starts on ${new Date(iso(item.current_period_end)).toLocaleDateString("en-US")}. Your current plan stays active until then.`,
  };
}
export async function pendingPlan(subscriptionId: string) {
  const sub = await stripe().subscriptions.retrieve(subscriptionId);
  const scheduleId = stripeId(sub.schedule);
  if (!scheduleId) return null;
  const s = await stripe().subscriptionSchedules.retrieve(scheduleId);
  const next = s.phases.find((p) => p.start_date > Date.now() / 1000);
  if (!next) return null;
  const m = planByPrice(stripeId(next.items[0]?.price) || "");
  return m
    ? {
        name: m.plan.name,
        cadence: m.cadence,
        date: iso(next.start_date),
        price: m.cadence === "year" ? m.plan.yearly : m.plan.monthly,
      }
    : null;
}
export async function releaseSchedule(subscriptionId: string, userId: string) {
  const api = stripe(),
    sub = await api.subscriptions.retrieve(subscriptionId);
  if (sub.metadata.reelform_user_id !== userId)
    throw new ApiError("This subscription could not be verified.", 403);
  const id = stripeId(sub.schedule);
  if (id) await api.subscriptionSchedules.release(id);
  return sub;
}
