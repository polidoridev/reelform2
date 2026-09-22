import { PLANS } from "./pricing";

export type PlanAccount = { plan: string; paid_until: string | null };

// Purchased credits remain usable with Starter features after a paid term ends.
// Canceling renewal does not remove features during the paid term.
export function videoEntitlements(account: PlanAccount | null, isAdmin = false, now = Date.now()) {
  if (isAdmin) return PLANS[2];
  const paid = account?.paid_until && Date.parse(account.paid_until) > now;
  return (paid && PLANS.find((plan) => plan.id === account?.plan)) || PLANS[0];
}

export function validateVideoEntitlements(
  plan: ReturnType<typeof videoEntitlements>,
  input: { resolution: string; duration: number; imageCount: number; generateAudio: boolean },
) {
  if (input.resolution === "1080p" && !plan.fullHd)
    throw new Error("1080p Full HD unlocks with Pro or Studio. Choose 720p or upgrade your plan.");
  if (input.duration > plan.maxSeconds)
    throw new Error(`${plan.name} supports clips up to ${plan.maxSeconds} seconds. Shorten your clip or upgrade for longer videos.`);
  if (input.imageCount > plan.maxImages)
    throw new Error(`${plan.name} includes up to ${plan.maxImages} reference photo${plan.maxImages === 1 ? "" : "s"} per video. Remove photos or upgrade for more references.`);
  if (input.generateAudio && !plan.generatedAudio)
    throw new Error("Generated audio unlocks with Pro or Studio. Choose Original audio or upgrade your plan.");
}
