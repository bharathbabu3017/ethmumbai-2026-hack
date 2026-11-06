import assert from "node:assert/strict";
import { test } from "node:test";
import { isAllowed, keyFor, withServerFields } from "./proxy";

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

test("the browser cannot set its own fee or builder code", () => {
  const server = { feeBps: "10", builderCode: "flashmob" };
  assert.equal(withServerFields("quote", { flashIntegratorFeeBps: "0" }, server).flashIntegratorFeeBps, "10");
  assert.equal(withServerFields("order", { erc8021AttributionCode: "evil" }, server).erc8021AttributionCode, "flashmob");
  assert.equal(withServerFields("quote", {}, server).erc8021AttributionCode, undefined);
  assert.equal(withServerFields("orders/cancel", {}, server).flashIntegratorFeeBps, undefined);
});

test("only search uses the search key", () => {
  assert.equal(keyFor("search", "mine", "public"), "public");
  for (const path of ["quote", "order", "orders", "balances/0x1"]) assert.equal(keyFor(path, "mine", "public"), "mine");
});
