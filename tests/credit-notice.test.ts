import test from "node:test";
import assert from "node:assert/strict";
import { creditNotice } from "../lib/commerce/credit-notice";

test("low-credit warning uses total balance and ten percent of each allowance", () => {
  for (const [plan, threshold] of [["starter", 200], ["pro", 550], ["studio", 1500]] as const) {
    assert.ok(creditNotice(threshold, plan));
    assert.equal(creditNotice(threshold + 1, plan), null);
    assert.match(creditNotice(0, plan)!.title, /out of credits/);
  }
});
test("unknown balances, free accounts and admins do not get purchase warnings", () => {
  assert.equal(creditNotice(null, "pro"), null);
  assert.equal(creditNotice(NaN, "pro"), null);
  assert.equal(creditNotice(-1, "pro"), null);
  assert.equal(creditNotice(0, "free"), null);
  assert.equal(creditNotice(0, "studio", true), null);
});
