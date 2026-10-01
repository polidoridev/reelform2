// Offline planning audit. No Stripe changes, account reads, or paid generations.
// Run: node --import tsx scripts/audit-pricing.ts [monthly overhead in USD]
import assert from "node:assert/strict";
import { PLANS, TOPUPS, CREDITS_PER_PROVIDER_DOLLAR, quoteVideo } from "../lib/commerce/pricing";
import { VIDEO_MODELS } from "../lib/video-models";

const feeRate = 0.07;
const feeFixedUsd = 0.30;
const refundReserve = 0.03;
const providerOverrun = 0.15;
const minimumContributionMargin = 0.45;
const overheads = process.argv[2] === undefined ? [100, 300, 1000] : [Number(process.argv[2])];
assert(overheads.every(n => Number.isFinite(n) && n >= 0), "Overhead must be a nonnegative USD amount");

const offers = [
  ...PLANS.flatMap(p => [
    { name: `${p.name} monthly`, revenue: p.monthly, credits: p.credits, months: 1 },
    { name: `${p.name} annual`, revenue: p.yearly, credits: p.credits * 12, months: 12 },
  ]),
  ...TOPUPS.map(p => ({ name: `Pack ${p.id}`, revenue: p.price, credits: p.credits, months: 0 })),
];
const rows = offers.map(o => {
  const provider = o.credits / CREDITS_PER_PROVIDER_DOLLAR;
  const contribution = o.revenue * (1 - feeRate - refundReserve) - feeFixedUsd - provider * (1 + providerOverrun);
  const margin = contribution / o.revenue;
  assert(margin >= minimumContributionMargin, `${o.name}: ${(margin * 100).toFixed(1)}% is below the 45% planning floor`);
  return { offer: o.name, revenue: o.revenue, providerBudget: provider.toFixed(2), contribution: contribution.toFixed(2), margin: `${(margin * 100).toFixed(1)}%`, monthlyContribution: o.months ? (contribution / o.months).toFixed(2) : "n/a", ...Object.fromEntries(overheads.map(h => [`customersFor$${h}`, o.months ? Math.ceil(h / (contribution / o.months)) : "n/a"])) };
});
// Exercise every supported edit resolution at short, fractional, and maximum
// durations. Rounding must never sell more modeled provider spend than credits cover.
for (const model of VIDEO_MODELS) for (const resolution of model.resolutions) {
  for (const duration of [4, 4.1, model.maxSeconds]) {
    const q = quoteVideo({ duration, width: 1920, height: 1080, bytes: 0 }, resolution, model.id);
    assert(Number.isFinite(q.estimatedProviderUsd) && q.estimatedProviderUsd > 0, `${model.id}: invalid rate`);
    assert(q.credits / CREDITS_PER_PROVIDER_DOLLAR >= q.estimatedProviderUsd, `${model.id}: underfunded quote`);
  }
}
console.log("USD; 100% credit use; 7% + $0.30 fees per payment; 3% revenue refund reserve; 15% provider overrun reserve.");
console.table(rows);
console.log("PASS: all offers meet the 45% contribution floor. Contribution excludes overhead, acquisition, owner pay and income tax; it is not net profit.");
console.log("Provider rates are configured estimates, not reconciled invoices. Re-run after rate/plan changes and reconcile actual debits before scaling.");
