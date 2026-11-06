import assert from "node:assert/strict";
import { test } from "node:test";
import { isAllowed, withPlatformFee } from "./proxy";

const id = "6bdb29aa-0000-4000-8000-000000000000";
const q = (s = "") => new URLSearchParams(s);

test("allows the calls the app needs", () => {
  assert.ok(isAllowed("POST", "quote", q()));
  assert.ok(isAllowed("GET", "balances/0xabc", q()));
  assert.ok(isAllowed("POST", `orders/${id}/cancel`, q()));
  assert.ok(isAllowed("GET", "orders", q("funderAddress=0xabc")));
});

test("blocks listing every user's orders and anything unknown", () => {
  assert.equal(isAllowed("GET", "orders", q()), false);
  assert.equal(isAllowed("POST", "setup-transaction", q()), false);
  assert.equal(isAllowed("DELETE", "order", q()), false);
  assert.equal(isAllowed("GET", "../admin", q()), false);
});

test("the browser cannot set its own fee", () => {
  assert.equal(withPlatformFee("quote", { flashIntegratorFeeBps: "0" }, "10").flashIntegratorFeeBps, "10");
  assert.equal(withPlatformFee("order", {}, "10").flashIntegratorFeeBps, "10");
  assert.equal(withPlatformFee("orders/cancel", {}, "10").flashIntegratorFeeBps, undefined);
});
