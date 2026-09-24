import { DEFAULT_VIDEO_MODEL, getVideoModel, validateModel, type VideoResolution } from "../video-models";
import { MIN_VIDEO_SECONDS, MAX_VIDEO_SECONDS } from "../video-limits";
export const PLANS = [
  {
    id: "starter",
    name: "Starter",
    monthly: 19,
    yearly: 190,
    credits: 2000,
    concurrency: 1,
    maxSeconds: 10,
    maxImages: 1,
    fullHd: false,
    generatedAudio: false,
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
    maxSeconds: 20,
    maxImages: 2,
    fullHd: true,
    generatedAudio: true,
    tagline: "For regular content and creative projects.",
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
    maxSeconds: 30,
    maxImages: 4,
    fullHd: true,
    generatedAudio: true,
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
export function quoteVideo(media: MediaInfo, resolution: VideoResolution, modelId = DEFAULT_VIDEO_MODEL) {
  if (
    ![media.duration, media.width, media.height].every(Number.isFinite) ||
    media.duration < MIN_VIDEO_SECONDS ||
    media.duration > MAX_VIDEO_SECONDS ||
    Math.min(media.width, media.height) <= 0
  )
    throw new Error("Use a video between 4 and 30 seconds.");
  const model = getVideoModel(modelId);
  validateModel(model, resolution, media.duration);
  const ratio =
    Math.max(media.width, media.height) / Math.min(media.width, media.height);
  if (ratio > 1.8)
    throw new Error(
      "Use a portrait, landscape, or square clip no wider than 16:9.",
    );
  const short = resolution === "1080p" ? 1080 : resolution === "720p" ? 720 : 480;
  const outputRatio = model.kind.includes("reference") ? (ratio > 1.2 ? 16 / 9 : 1) : ratio;
  const long = Math.ceil((short * outputRatio) / 16) * 16;
  const duration = Math.ceil(media.duration * 10) / 10;
  const outputDuration = model.kind.includes("reference") ? Math.ceil(duration) : duration;
  const tokens = Math.ceil(((duration + outputDuration) * short * long * 24) / 1024);
  const providerUsd = model.kind === "genjutsu"
    ? Math.ceil(duration) * (resolution === "720p" ? 0.681 : 0.318)
    : model.secondRate ? Math.ceil(duration) * model.secondRate
    : tokens * (model.tokenRate! / 1000);
  return {
    credits: Math.ceil((providerUsd * CREDITS_PER_PROVIDER_DOLLAR) / 10) * 10,
    duration: outputDuration,
    model: model.id,
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
