import test from "node:test";
import assert from "node:assert/strict";
import { CREDIT_OFFERS, CREDITS_PER_PROVIDER_DOLLAR, quoteVideo } from "../lib/commerce/pricing";
import { contributionForOffer, creditConversionForOffers, creditsForProviderCost, validateQuotedCredits, MARGIN_POLICY } from "../lib/commerce/economics";

const media = { duration: 30, width: 1920, height: 1080, bytes: 1000 };
test("30s Genjutsu uses API list prices at every resolution, independently of website credits", () => {
  for (const model of ["genjutsu-motion", "genjutsu-object"]) {
    for (const [resolution, usd, credits] of [["480p", 9.54, 3440], ["720p", 20.43, 7360], ["1080p", 48.96, 17630]] as const) {
      const quote = quoteVideo(media, resolution, model);
      assert.ok(Math.abs(quote.estimatedProviderUsd - usd) < 1e-8);
      assert.equal(quote.credits, credits);
    }
  }
  assert.equal(quoteVideo({ ...media, duration: 4.01 }, "1080p").credits, 2940, "fractional input seconds round up for provider billing");
});
test("full credit use retains the contribution floor for annual, monthly, preset and all custom packs", () => {
  assert.equal(CREDITS_PER_PROVIDER_DOLLAR, 360, "verified existing offers do not need a price increase");
  for (const offer of CREDIT_OFFERS) {
    assert.ok(contributionForOffer(offer, CREDITS_PER_PROVIDER_DOLLAR).margin >= MARGIN_POLICY.minimumContributionMargin, offer.name);
  }
});
test("a discounted offer or bigger credit grant cannot silently erode the margin floor", () => {
  const offers = [...CREDIT_OFFERS, { name: "Discount scenario", revenue: 99, credits: 20000, months: 1 }];
  const conversion = creditConversionForOffers(offers);
  assert.ok(conversion > 360);
  for (const offer of offers) assert.ok(contributionForOffer(offer, conversion).margin >= 0.45, offer.name);
  const expensiveFees = { ...MARGIN_POLICY, paymentRate: 0.1 };
  const rate = creditConversionForOffers(CREDIT_OFFERS, expensiveFees);
  for (const offer of CREDIT_OFFERS) assert.ok(contributionForOffer(offer, rate, expensiveFees).margin >= 0.45);
  assert.throws(() => creditConversionForOffers([{ name: "Unfunded", revenue: 0.1, credits: 1000, months: 1 }]), /cannot cover/);
});
test("unknown, zero and invalid provider costs fail closed", () => {
  for (const cost of [NaN, Infinity, -1, 0]) assert.throws(() => creditsForProviderCost(cost, 360), /unavailable/);
  for (const rate of [NaN, Infinity, -1, 0]) assert.throws(() => creditsForProviderCost(5, rate), /unavailable/);
  assert.ok(creditsForProviderCost(48.96, 360) / 360 >= 48.96);
});
test("stale or invalid quotes require review; only explicit complimentary quotes may be zero", () => {
  validateQuotedCredits(17630, 17630);
  validateQuotedCredits(0, 17630, true);
  for (const quoted of [8810, 17640, -10, 0, NaN, Infinity, 17630.5])
    assert.throws(() => validateQuotedCredits(quoted, 17630), /Refresh the quote/);
  assert.throws(() => validateQuotedCredits(17630, 17630, true), /Refresh the quote/);
});
