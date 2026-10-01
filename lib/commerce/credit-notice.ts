import { PLANS } from "./pricing";

export function creditNotice(balance: number | null, planId: string, isAdmin = false) {
  const plan = PLANS.find((item) => item.id === planId);
  if (isAdmin || balance === null || !Number.isFinite(balance) || balance < 0 || !plan)
    return null;
  if (balance > Math.ceil(plan.credits * 0.1)) return null;
  return {
    title: balance === 0 ? "You’re out of credits" : "Your credits are running low",
    detail: `${balance.toLocaleString("en-US")} credits remaining. Add credits or manage your plan to keep creating.`,
  };
}
