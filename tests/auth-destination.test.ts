import test from "node:test";
import assert from "node:assert/strict";
import { authDestination } from "../lib/auth-destination";

test("studio and community destinations survive authentication", () => {
  assert.equal(authDestination("/studio"), "/studio");
  assert.equal(authDestination("/community/share"), "/community/share");
  assert.equal(authDestination(undefined, "/studio"), "/studio");
});
test("untrusted query values and profile metadata cannot redirect outside known routes", () => {
  for (const value of [null, {}, ["/studio"], "https://example.com", "//example.com", "/\\example.com", "/studio?next=https://example.com", "javascript:alert(1)"])
    assert.equal(authDestination(value), "/account");
});
