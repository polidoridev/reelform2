import test from "node:test";
import assert from "node:assert/strict";
import { generationFailureMessage } from "../lib/commerce/generation-errors";

test("moderation failures explain the block without inventing a trigger or a refund", () => {
  const message = generationFailureMessage("nsfw", undefined, 0);
  assert.match(message, /content filter blocked/);
  assert.match(message, /did not identify which input/);
  assert.match(message, /No Reelform credits were charged/);
  assert.doesNotMatch(message, /credits were returned/);
});

test("provider funding failures do not tell customers to purchase more credits", () => {
  const message = generationFailureMessage("failed", "Your credit balance is too low to complete this request. Please top up your balance and try again.", 200);
  assert.match(message, /provider balance needs a top-up/);
  assert.match(message, /adding credits to your Reelform account will not resolve this/);
  assert.match(message, /Your credits were returned/);
});

test("unknown provider errors are never passed through to customers", () => {
  for (const error of ["secret request details", { message: "private upstream data" }, null]) {
    const message = generationFailureMessage("failed", error, 0);
    assert.match(message, /contact support/);
    assert.doesNotMatch(message, /secret|private upstream/);
  }
  assert.match(generationFailureMessage("canceled", null, 1), /was canceled/);
});
