import { ApiError } from "../http";
import type { PlanAccount } from "../commerce/entitlements";

export function canPublishInstagram(
  account: PlanAccount | null,
  now = Date.now(),
) {
  return Boolean(
    account &&
    ["pro", "studio"].includes(account.plan) &&
    account.paid_until &&
    Date.parse(account.paid_until) > now,
  );
}

export function scheduledTime(value?: string | null, now = Date.now()) {
  if (value == null) return null;
  const time = Date.parse(value);
  if (
    !Number.isFinite(time) ||
    !/(Z|[+-]\d{2}:\d{2})$/.test(value) ||
    time < now + 60000 ||
    time > now + 90 * 86400000
  )
    throw new ApiError(
      "Choose a time at least one minute from now and within the next 90 days.",
    );
  return new Date(time).toISOString();
}
