import assert from "node:assert/strict";
import { test } from "node:test";
import { bucketFor, createLimiter } from "./rate-limit";

test("blocks past the limit, per visitor, and resets after a minute", () => {
  const clock = { t: 0 };
  const check = createLimiter(() => clock.t);
  for (let i = 0; i < 3; i++) assert.equal(check("a", 3).ok, true);
  const blocked = check("a", 3);
  assert.deepEqual([blocked.ok, blocked.retryAfter], [false, 60]);
  assert.equal(check("b", 3).ok, true);
  clock.t = 60_000;
  assert.equal(check("a", 3).ok, true);
});

test("order actions get the strictest limit", () => {
  assert.equal(bucketFor("POST", "order"), "order");
  assert.equal(bucketFor("POST", "orders/cancel"), "order");
  assert.equal(bucketFor("PATCH", "orders/x"), "order");
  assert.equal(bucketFor("POST", "quote"), "quote");
  assert.equal(bucketFor("GET", "search"), "search");
  assert.equal(bucketFor("GET", "balances/0x1"), "read");
});
