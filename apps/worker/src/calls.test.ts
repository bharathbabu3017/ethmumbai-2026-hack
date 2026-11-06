import assert from "node:assert/strict";
import { test } from "node:test";
import { bracketChange, changeAlert, entryChange, ownOrderAlert, type OrderFrame } from "./calls";

const call = { status: "waiting", entryPrice: null, stopPrice: 90, targetPrice: 120 };
const frame = (over: Partial<OrderFrame>): OrderFrame => ({
  orderId: "o", orderType: "limit", side: "buy", status: "ORDER_STATUS_ACCEPTED", funderAddress: "0x", qty: "1",
  targetAsset: { ticker: "WETH" }, filled: null, ...over,
});

test("a waiting call goes live on its first fill, using the fill price", () => {
  const change = entryChange(call, frame({ status: "ORDER_STATUS_PARTIALLY_FILLED", filled: { targetAmount: "2", contraAmount: "200" } }));
  assert.deepEqual(change, { status: "live", entryPrice: 100 });
});

test("a limit call keeps its stated entry price", () => {
  const change = entryChange({ ...call, entryPrice: 99 }, frame({ status: "ORDER_STATUS_FILLED", filled: { targetAmount: "1", contraAmount: "98" } }));
  assert.deepEqual(change, { status: "live", entryPrice: 99 });
});

test("an open unfilled order changes nothing, and a closed unfilled one is cancelled", () => {
  assert.equal(entryChange(call, frame({})), null);
  assert.deepEqual(entryChange(call, frame({ status: "ORDER_STATUS_CANCELLED" })), { status: "cancelled" });
});

test("cancelling the rest of a part-filled entry does not cancel a live call", () => {
  assert.equal(entryChange({ ...call, status: "live", entryPrice: 100 }, frame({ status: "ORDER_STATUS_CANCELLED" })), null);
});

test("an exit near the target is a win and near the stop is a stop-out", () => {
  const live = { ...call, status: "live", entryPrice: 100 };
  const win = bracketChange(live, frame({ status: "ORDER_STATUS_FILLED", filled: { targetAmount: "1", contraAmount: "119" } }));
  assert.deepEqual(win, { status: "target_hit", exitPrice: 119, resultPct: 19 });
  const loss = bracketChange(live, frame({ status: "ORDER_STATUS_FILLED", filled: { targetAmount: "1", contraAmount: "89" } }));
  assert.equal(loss?.status, "stopped_out");
  assert.equal(loss?.status === "stopped_out" && loss.resultPct, -11);
});

test("a cancelled bracket does not close the call", () => {
  assert.equal(bracketChange({ ...call, status: "live", entryPrice: 100 }, frame({ status: "ORDER_STATUS_CANCELLED" })), null);
});

test("alerts read clearly", () => {
  assert.equal(changeAlert("Ana", "WETH", { status: "cancelled" }), "Ana cancelled their WETH call.");
  assert.match(changeAlert("Ana", "WETH", { status: "target_hit", exitPrice: 3760, resultPct: 9.9 }), /\$3,760 \(\+9\.9%\)/);
  assert.match(ownOrderAlert(frame({ status: "ORDER_STATUS_CANCELLED", closeReason: "REASON_INSUFFICIENT_FUNDER_BALANCE" })), /not enough balance/);
});
