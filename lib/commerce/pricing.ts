import { MIN_VIDEO_SECONDS, MAX_VIDEO_SECONDS } from "../video-limits";
export const PLANS = [
  {
    id: "starter",
    name: "Starter",
    monthly: 19,
    yearly: 190,
    credits: 2000,
    concurrency: 1,
    tagline: "Your first taste of another life.",
    monthlyEnv: "STRIPE_PRICE_STARTER",
    yearlyEnv: "STRIPE_PRICE_STARTER_YEARLY",
  },
  {
    id: "pro",
    name: "Pro",
    monthly: 49,
    yearly: 490,
    credits: 5500,
    concurrency: 2,
    tagline: "For your next main character era.",
    monthlyEnv: "STRIPE_PRICE_PRO",
    yearlyEnv: "STRIPE_PRICE_PRO_YEARLY",
  },
  {
    id: "studio",
    name: "Studio",
    monthly: 129,
    yearly: 1290,
    credits: 15000,
    concurrency: 3,
    tagline: "More ideas. More room to create.",
    monthlyEnv: "STRIPE_PRICE_STUDIO",
    yearlyEnv: "STRIPE_PRICE_STUDIO_YEARLY",
  },
] as const;
export const TOPUPS = [
  {
    id: "small",
    name: "A little extra",
    credits: 900,
    price: 10,
    env: "STRIPE_PRICE_TOPUP_SMALL",
  },
  {
    id: "medium",
    name: "Keep creating",
    credits: 2400,
    price: 25,
    env: "STRIPE_PRICE_TOPUP_MEDIUM",
  },
  {
    id: "large",
    name: "The big idea",
    credits: 6200,
    price: 60,
    env: "STRIPE_PRICE_TOPUP_LARGE",
  },
] as const;
export type PlanId = (typeof PLANS)[number]["id"];
export type MediaInfo = {
  duration: number;
  width: number;
  height: number;
  bytes: number;
};
// Published undiscounted Seedance 2.5 Edit formula, verified 2026-09-20.
// Both source and output seconds are billed; no account discount is assumed.
export const VIDEO_TOKEN_USD = 0.01284 / 1000;
export const CREDITS_PER_PROVIDER_DOLLAR = 360;
export function quoteVideo(media: MediaInfo, resolution: "480p" | "720p") {
  if (
    ![media.duration, media.width, media.height].every(Number.isFinite) ||
    media.duration < MIN_VIDEO_SECONDS ||
    media.duration > MAX_VIDEO_SECONDS ||
    Math.min(media.width, media.height) <= 0
  )
    throw new Error("Use a video between 4 and 30 seconds.");
  const ratio =
    Math.max(media.width, media.height) / Math.min(media.width, media.height);
  if (ratio > 1.8)
    throw new Error(
      "Use a portrait, landscape, or square clip no wider than 16:9.",
    );
  const short = resolution === "720p" ? 720 : 480;
  const long = Math.ceil((short * ratio) / 16) * 16;
  const duration = Math.ceil(media.duration * 10) / 10;
  const tokens = Math.ceil((duration * 2 * short * long * 24) / 1024);
  const providerUsd = tokens * VIDEO_TOKEN_USD;
  return {
    credits: Math.ceil((providerUsd * CREDITS_PER_PROVIDER_DOLLAR) / 10) * 10,
    duration,
    resolution,
    estimatedProviderUsd: providerUsd,
  };
}
export function planByPrice(price: string) {
  for (const p of PLANS)
    for (const cadence of ["month", "year"] as const) {
      const id = process.env[cadence === "month" ? p.monthlyEnv : p.yearlyEnv];
      if (id && id === price) return { plan: p, cadence };
    }
  return null;
}
export const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
