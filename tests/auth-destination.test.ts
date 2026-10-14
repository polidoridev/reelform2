import test from "node:test";
import assert from "node:assert/strict";
import { authDestination } from "../lib/auth-destination";

test("studio and community destinations survive authentication", () => {
  assert.equal(authDestination("/studio"), "/studio");
  assert.equal(authDestination("/aura"), "/aura");
  assert.equal(authDestination("/community/share"), "/community/share");
  assert.equal(authDestination(undefined, "/studio"), "/studio");
});
test("untrusted query values and profile metadata cannot redirect outside known routes", () => {
  for (const value of [null, {}, ["/studio"], "https://example.com", "//example.com", "/\\example.com", "/studio?next=https://example.com", "javascript:alert(1)"])
    assert.equal(authDestination(value), "/account");
});

test("saved chats survive sign-in without accepting arbitrary redirects", () => {
  const id = "12345678-1234-1234-1234-123456789abc";
  for (const key of ["generation", "request"]) {
    const path = `/studio?${key}=${id}`;
    assert.equal(authDestination(path), path);
    assert.equal(authDestination(`${path}&next=https://example.com`), "/account");
  }
  assert.equal(authDestination("/studio?generation=../../account"), "/account");
});

test("known motion presets and the explicit free trial survive sign-in", () => {
  for (const path of ["/studio?useCase=duo-character-swap", "/studio?useCase=product-swap", "/studio?trial=1"]) {
    assert.equal(authDestination(path), path);
    assert.equal(authDestination(`${path}&next=https://example.com`), "/account");
  }
  for (const path of ["/studio?trial=0", "/studio?useCase=unknown", "/studio?useCase=../account"])
    assert.equal(authDestination(path), "/account");
});
