// Planning reserves, not measured expenses or a promise of net profit.
export const MARGIN_POLICY = {
  paymentRate: 0.07,
  paymentFixedUsd: 0.30,
  refundRate: 0.03,
  providerOverrun: 0.15,
  minimumContributionMargin: 0.45,
} as const;
export type CreditOffer = { name: string; revenue: number; credits: number; months: number };
export type MarginPolicy = { [K in keyof typeof MARGIN_POLICY]: number };

export function contributionForOffer(offer: CreditOffer, creditsPerProviderDollar: number, policy: MarginPolicy = MARGIN_POLICY) {
  const providerBudget = offer.credits / creditsPerProviderDollar;
  const contribution = offer.revenue * (1 - policy.paymentRate - policy.refundRate) - policy.paymentFixedUsd - providerBudget * (1 + policy.providerOverrun);
  return { providerBudget, contribution, margin: contribution / offer.revenue };
}

// Protect the cheapest credits too, including annual allowances and custom packs.
// A cheaper offer or a larger grant automatically requires more credits per API dollar.
export function creditConversionForOffers(offers: readonly CreditOffer[], policy: MarginPolicy = MARGIN_POLICY, baseline = 360) {
  if (!offers.length || !Number.isFinite(baseline) || baseline <= 0 ||
      Object.values(policy).some(value => !Number.isFinite(value) || value < 0))
    throw new Error("Invalid generation margin policy.");
  let required = baseline;
  for (const offer of offers) {
    const available = offer.revenue * (1 - policy.paymentRate - policy.refundRate - policy.minimumContributionMargin) - policy.paymentFixedUsd;
    if (!Number.isFinite(offer.revenue) || !Number.isSafeInteger(offer.credits) || offer.credits <= 0 || available <= 0)
      throw new Error(`The ${offer.name} offer cannot cover generation costs.`);
    required = Math.max(required, offer.credits * (1 + policy.providerOverrun) / available);
  }
  return Math.ceil(required / 10) * 10;
}

export function creditsForProviderCost(providerUsd: number, creditsPerProviderDollar: number) {
  if (!Number.isFinite(providerUsd) || providerUsd <= 0 || !Number.isFinite(creditsPerProviderDollar) || creditsPerProviderDollar <= 0)
    throw new Error("Generation pricing is unavailable. Please try again later.");
  const credits = Math.ceil(providerUsd * creditsPerProviderDollar / 10) * 10;
  if (!Number.isSafeInteger(credits)) throw new Error("Generation pricing is unavailable.");
  return credits;
}

// Never silently charge a different amount from the customer's signed quote.
export function validateQuotedCredits(quoted: number, current: number, complimentary = false) {
  if (!Number.isSafeInteger(quoted) || quoted < 0 || !Number.isSafeInteger(current) || current <= 0 ||
      quoted !== (complimentary ? 0 : current))
    throw new Error("Generation pricing changed. Refresh the quote and review the new credit cost before generating.");
}
