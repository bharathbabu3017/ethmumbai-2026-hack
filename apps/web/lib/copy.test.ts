import assert from "node:assert/strict";
import { test } from "node:test";
import { callBlock, copyInputError, copyMode } from "./copy";

const call = { status: "waiting", entryType: "limit", entryPrice: 100, stopPrice: 90, targetPrice: 120 };
const input = { amountUsd: 10, stopPrice: 90, targetPrice: 120 };

test("a waiting limit call copies at its limit, anything else at market", () => {
  assert.equal(copyMode(call), "limit");
  assert.equal(copyMode({ ...call, status: "live" }), "market");
  assert.equal(copyMode({ ...call, entryType: "market" }), "market");
});

test("copying locks when the call is closed or the price passed a level", () => {
  assert.equal(callBlock(call, 105), null);
  assert.equal(callBlock({ ...call, status: "live" }, 105), null);
  for (const status of ["cancelled", "target_hit", "stopped_out", "closed"]) assert.match(callBlock({ ...call, status }, 105)!, /closed/);
  assert.match(callBlock(call, 90)!, /stop/);
  assert.match(callBlock(call, 120)!, /target/);
});

test("the follower's levels are checked against their real entry", () => {
  assert.equal(copyInputError(call, 105, input), null);
  assert.match(copyInputError(call, 105, { ...input, amountUsd: 0 })!, /amount/);
  assert.match(copyInputError(call, 105, { ...input, stopPrice: 101 })!, /stop/);
  assert.match(copyInputError({ ...call, status: "live" }, 110, { ...input, targetPrice: 109 })!, /target/);
  assert.match(copyInputError(call, 105, { ...input, targetPrice: Number.NaN })!, /stop and target/);
});
