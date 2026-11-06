import assert from "node:assert/strict";
import { test } from "node:test";
import { USDC_BASE } from "@flashmob/flash";
import { orderFields, ownOrderAlert, tradeAlert, type OrderFrame } from "./trades";

const owner = { userId: "u", walletId: "w" };
const frame = (over: Partial<OrderFrame> = {}): OrderFrame => ({
  orderId: "o", orderType: "limit", side: "buy", status: "ORDER_STATUS_ACCEPTED", funderAddress: "0x", qty: "25",
  targetAsset: { ticker: "WETH", address: "0xweth", chain: "base" }, contraAsset: { ticker: "USDC", address: USDC_BASE, chain: "base" },
  filled: null, limitNotionalPrice: null, limitCrossPrice: "2000", ...over,
});
const row = (over = {}) => {
  const { raw: _raw, usdPriced: _u, id: _i, userId: _a, walletId: _b, isPublic: _p, chain: _c, tokenAddress: _t, placedAt: _d, ...f } = orderFields(frame(), owner, true);
  return { ...f, realizedUsd: 0, soldCostUsd: 0, ...over };
};

test("reads the chain from either frame shape, and fills as USD against USDC", () => {
  const f = orderFields(frame({ targetAsset: { ticker: "WETH", address: "0xweth", chain: { name: "base" } }, filled: { targetAmount: "2", contraAmount: "200" } }), owner, true);
  assert.deepEqual([f.chain, f.filledQty, f.filledUsd, f.usdPriced, f.limitPrice], ["base", 2, 200, true, 2000]);
});

test("a fill against another asset has no USD value", () => {
  const f = orderFields(frame({ contraAsset: { ticker: "cbBTC", address: "0xbtc", chain: "base" }, filled: { targetAmount: "2", contraAmount: "0.1" } }), owner, true);
  assert.deepEqual([f.usdPriced, f.filledUsd], [false, 0]);
});

test("stop and target come from bracket legs, triggers, or the attached pair", () => {
  const legs = [{ notionalPrice: "90", triggerType: "lower" }, { notionalPrice: "120", triggerType: "upper" }];
  const b = orderFields(frame({ orderType: "bracket", brackets: legs }), owner, true);
  assert.deepEqual([b.stopPrice, b.targetPrice], [90, 120]);
  const t = orderFields(frame({ orderType: "stop-loss", trigger: legs[0] }), owner, true);
  assert.deepEqual([t.stopPrice, t.targetPrice], [90, null]);
  const a = orderFields(frame(), owner, true, { stop: 80, target: 130 });
  assert.deepEqual([a.stopPrice, a.targetPrice], [80, 130]);
});

test("a new limit order alerts with its details", () => {
  const text = tradeAlert("Ana", row({ stopPrice: 1900, targetPrice: 2500 }), { isNew: true, statusChanged: true });
  assert.equal(text, "🕓 Ana placed a limit buy of WETH\n$25 at $2,000\nStop $1,900 · Target $2,500");
});

test("a market order alerts on its fill, not when placed", () => {
  assert.equal(tradeAlert("Ana", row({ orderType: "market", limitPrice: null }), { isNew: true, statusChanged: true }), null);
  const filled = row({ orderType: "market", status: "ORDER_STATUS_FILLED", filledQty: 2, filledUsd: 4000 });
  assert.equal(tradeAlert("Ana", filled, { isNew: true, statusChanged: true }), "🟢 Ana bought WETH\n$4,000 at $2,000");
});

test("a sale alerts with its result", () => {
  const sold = row({ side: "sell", orderType: "market", status: "ORDER_STATUS_FILLED", filledQty: 1, filledUsd: 2200, realizedUsd: 200, soldCostUsd: 2000 });
  assert.equal(tradeAlert("Ana", sold, { isNew: false, statusChanged: true }), "🔴 Ana sold WETH\n$2,200 at $2,200 · +10.0%");
});

test("a trader's cancel is relayed, but a discarded protective pair is not", () => {
  assert.equal(tradeAlert("Ana", row({ status: "ORDER_STATUS_CANCELLED" }), { isNew: false, statusChanged: true }), "⚪ Ana cancelled their limit buy of WETH");
  assert.equal(tradeAlert("Ana", row({ status: "ORDER_STATUS_CANCELLED", orderType: "bracket", entryOrderId: "e" }), { isNew: false, statusChanged: true }), null);
});

test("a replayed frame with no change says nothing", () => {
  assert.equal(tradeAlert("Ana", row({ status: "ORDER_STATUS_FILLED" }), { isNew: false, statusChanged: false }), null);
  assert.equal(tradeAlert("Ana", row(), { isNew: false, statusChanged: false }), null);
});

test("own alerts show the amounts and the result of a sale", () => {
  const bought = row({ filledQty: 3.215, filledUsd: 1.94 });
  assert.equal(ownOrderAlert(frame({ status: "ORDER_STATUS_FILLED" }), bought), "✅ Your WETH buy filled\n3.215 WETH for $1.94 at $0.6034");
  const sold = row({ side: "sell", filledQty: 3.215, filledUsd: 1.88, realizedUsd: -0.06, soldCostUsd: 1.94 });
  assert.equal(ownOrderAlert(frame({ side: "sell", status: "ORDER_STATUS_FILLED" }), sold), "✅ Your WETH sell filled\n3.215 WETH for $1.88 at $0.5848 · -3.1%");
});

test("own order alerts explain why an order closed", () => {
  assert.match(ownOrderAlert(frame({ status: "ORDER_STATUS_CANCELLED", closeReason: "REASON_INSUFFICIENT_FUNDER_BALANCE" })), /not enough balance/);
});
