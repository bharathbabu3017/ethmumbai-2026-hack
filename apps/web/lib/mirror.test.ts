import assert from "node:assert/strict";
import { test } from "node:test";
import { mirrorPlan, sellAmount } from "./mirror";

const base = { qty: 0.0125, held: 0.025, pairOrderIds: ["p1"], stop: 1800, target: 2400 };

test("a partial sale cancels the old exits and protects what's left", () => {
  assert.deepEqual(mirrorPlan(base), { sellQty: "0.0125", cancel: ["p1"], protectQty: "0.0125" });
});

test("selling everything cancels the exits and places no new ones", () => {
  assert.deepEqual(mirrorPlan({ ...base, qty: 0.025 }), { sellQty: "0.025", cancel: ["p1"], protectQty: null });
});

test("a position with no stop and target just sells", () => {
  assert.deepEqual(mirrorPlan({ ...base, pairOrderIds: [], stop: null, target: null }), { sellQty: "0.0125", cancel: [], protectQty: null });
});

test("it never sells more than the wallet holds", () => {
  assert.equal(mirrorPlan({ ...base, qty: 1, held: 0.01 }).sellQty, "0.01");
  assert.equal(sellAmount(0.123456789), "0.12345678");
});
