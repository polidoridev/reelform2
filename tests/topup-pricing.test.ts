import test from "node:test";
import assert from "node:assert/strict";
import { CUSTOM_TOPUP, TOPUPS, quoteTopupCredits } from "../lib/commerce/pricing";

test("custom amounts preserve all published pack prices", () => {
  for (const pack of TOPUPS) assert.equal(quoteTopupCredits(pack.credits), pack.price * 100);
  assert.equal(quoteTopupCredits(3000), 3053);
  assert.equal(quoteTopupCredits(12400), 12000);
  assert.equal(quoteTopupCredits(20000), 19355);
});
test("every slider amount has a positive integer price that strictly increases", () => {
  let previous = 0;
  for (let credits = CUSTOM_TOPUP.min; credits <= CUSTOM_TOPUP.max; credits += CUSTOM_TOPUP.step) {
    const cents = quoteTopupCredits(credits);
    assert.ok(Number.isInteger(cents));
    assert.ok(cents > previous);
    previous = cents;
  }
});
test("invalid, fractional, and out-of-range credit amounts are rejected", () => {
  for (const credits of [0, -100, 800, 950, 900.5, 20100, NaN, Infinity, "900", null])
    assert.throws(() => quoteTopupCredits(credits as number));
});
