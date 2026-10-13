import { cookies } from "next/headers";
import { admin } from "@/lib/supabase/server";
import { ApiError } from "@/lib/http";
import type { TrialStatus } from "./trial";

// A first-party, HttpOnly cookie supplies a best-effort duplicate-browser signal.
// The database also enforces verified identity, per-user limits, and a global cap.
export async function trialDevice() {
  const jar = await cookies();
  let value = jar.get("rf-trial-device")?.value;
  if (!value || !/^[0-9a-f-]{36}$/.test(value)) {
    value = crypto.randomUUID();
    jar.set("rf-trial-device", value, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 365 * 86400 });
  }
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, "0")).join("");
}
export async function trialStatus(userId: string): Promise<TrialStatus> {
  const { data, error } = await admin().rpc("rf_trial_status", { p_user: userId, p_device: await trialDevice() });
  // An older database must not break paid accounts during a rolling deployment.
  if (error?.code === "PGRST202") return { state: "paused", attemptsRemaining: 0 };
  if (error) throw new ApiError("Could not check your free transformation. Please try again.", 503);
  return data as TrialStatus;
}
