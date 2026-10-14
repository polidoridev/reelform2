// Offline planning audit. No Stripe changes, account reads, or paid generations.
// Run: node --import tsx scripts/audit-pricing.ts [monthly overhead in USD]
import assert from "node:assert/strict";
import { CREDIT_OFFERS, CREDITS_PER_PROVIDER_DOLLAR, quoteVideo, quoteCreation } from "../lib/commerce/pricing";
import { contributionForOffer, MARGIN_POLICY } from "../lib/commerce/economics";
import { VIDEO_MODELS, modelAspectRatios } from "../lib/video-models";

const overheads = process.argv[2] === undefined ? [100, 300, 1000] : [Number(process.argv[2])];
assert(overheads.every(n => Number.isFinite(n) && n >= 0), "Overhead must be a nonnegative USD amount");
const rows = CREDIT_OFFERS.map(offer => {
  const { providerBudget, contribution, margin } = contributionForOffer(offer, CREDITS_PER_PROVIDER_DOLLAR);
  assert(margin >= MARGIN_POLICY.minimumContributionMargin, `${offer.name}: ${(margin * 100).toFixed(1)}% is below the 45% planning floor`);
  return { offer: offer.name, revenue: offer.revenue, providerBudget: providerBudget.toFixed(2), contribution: contribution.toFixed(2), margin: `${(margin * 100).toFixed(1)}%`, monthlyContribution: offer.months ? (contribution / offer.months).toFixed(2) : "n/a", ...Object.fromEntries(overheads.map(h => [`customersFor$${h}`, offer.months ? Math.ceil(h / (contribution / offer.months)) : "n/a"])) };
});
let quotes = 0;
function covered(q: ReturnType<typeof quoteVideo>) {
  assert(Number.isFinite(q.estimatedProviderUsd) && q.estimatedProviderUsd > 0, `${q.model}: invalid rate`);
  assert(q.credits / CREDITS_PER_PROVIDER_DOLLAR >= q.estimatedProviderUsd, `${q.model}: underfunded quote`);
  quotes++;
}
for (const model of VIDEO_MODELS) for (const resolution of model.resolutions) {
  for (const duration of [4, 4.1, model.maxSeconds]) {
    covered(quoteVideo({ duration, width: 1920, height: 1080, bytes: 0 }, resolution, model.id));
    if (model.video === "optional") for (const shape of modelAspectRatios(model)) covered(quoteCreation(duration, resolution, shape, model.id));
  }
}
console.log(`USD; ${CREDITS_PER_PROVIDER_DOLLAR} credits/API dollar; 100% credit use; 7% + $0.30 fees; 3% refund reserve; 15% provider overrun reserve.`);
console.table(rows.filter(row => !row.offer.startsWith("Custom")));
console.log(`PASS: all ${CREDIT_OFFERS.length} offers, including every custom pack, meet the 45% contribution floor; ${quotes} edit/creation quotes cover modeled provider spend.`);
console.table((["480p", "720p", "1080p"] as const).map(resolution => {
  const q = quoteVideo({ duration: 30, width: 1920, height: 1080, bytes: 0 }, resolution);
  return { duration: "30 seconds", resolution, providerUsd: q.estimatedProviderUsd.toFixed(2), reelformCredits: q.credits };
}));
console.log("Contribution excludes overhead, acquisition, free trials, admin use, owner pay and income tax; it is not net profit. Rates are configured estimates; reconcile actual provider debits before scaling.");
