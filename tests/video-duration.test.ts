import test from "node:test";
import assert from "node:assert/strict";
import { quoteVideo } from "../lib/commerce/pricing";

const media = { width: 1280, height: 720, bytes: 1000000 };
test("30-second videos receive a full-duration quote at both supported resolutions", () => {
  for (const resolution of ["480p", "720p"] as const) {
    const short = quoteVideo({ ...media, duration: 5 }, resolution);
    const full = quoteVideo({ ...media, duration: 30 }, resolution);
    assert.equal(full.duration, 30);
    assert.ok(Math.abs(full.estimatedProviderUsd - short.estimatedProviderUsd * 6) < 0.0001);
    assert.ok(full.credits >= full.estimatedProviderUsd * 360);
  }
});
test("duration limits reject oversized and invalid clips", () => {
  for (const duration of [30.001, 31, 3.99, 0, NaN, Infinity]) {
    assert.throws(() => quoteVideo({ ...media, duration }, "720p"), /4 and 30 seconds/);
  }
  assert.equal(quoteVideo({ ...media, duration: 4 }, "720p").duration, 4);
});
