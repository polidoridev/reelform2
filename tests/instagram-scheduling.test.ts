import test from "node:test";
import assert from "node:assert/strict";
import {
  canPublishInstagram,
  scheduledTime,
} from "../lib/instagram/scheduling";

const now = Date.parse("2026-10-12T12:00:00Z");
test("Instagram requires a current Pro or higher paid term", () => {
  for (const plan of ["pro", "studio"]) {
    assert(
      canPublishInstagram(
        { plan, paid_until: new Date(now + 1).toISOString() },
        now,
      ),
    );
    assert(
      !canPublishInstagram(
        { plan, paid_until: new Date(now).toISOString() },
        now,
      ),
    );
    assert(!canPublishInstagram({ plan, paid_until: null }, now));
  }
  assert(
    !canPublishInstagram(
      { plan: "starter", paid_until: new Date(now + 86400000).toISOString() },
      now,
    ),
  );
  assert(
    !canPublishInstagram(
      { plan: "unknown", paid_until: new Date(now + 86400000).toISOString() },
      now,
    ),
  );
  assert(!canPublishInstagram(null, now));
});
test("schedules normalize offsets and reject invalid, past, or unbounded times", () => {
  assert.equal(scheduledTime(undefined, now), null);
  assert.equal(scheduledTime(null, now), null);
  assert.equal(
    scheduledTime("2026-10-12T08:01:00-04:00", now),
    "2026-10-12T12:01:00.000Z",
  );
  assert.equal(
    scheduledTime(new Date(now + 90 * 86400000).toISOString(), now),
    new Date(now + 90 * 86400000).toISOString(),
  );
  for (const value of [
    "garbage",
    "",
    "2026-10-12T13:00:00",
    new Date(now - 1).toISOString(),
    new Date(now + 59999).toISOString(),
    new Date(now + 91 * 86400000).toISOString(),
  ])
    assert.throws(() => scheduledTime(value, now));
});
