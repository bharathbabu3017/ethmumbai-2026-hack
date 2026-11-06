import assert from "node:assert/strict";
import { test } from "node:test";
import { copyInputError, copyMode, entryPrice, tradeBlock } from "./copy";

const open = { side: "buy", status: "ORDER_STATUS_ACCEPTED", orderType: "limit", limitPrice: 100, stopPrice: 90, targetPrice: 120, filledQty: 0, filledUsd: 0 };
const filled = { ...open, status: "ORDER_STATUS_FILLED", orderType: "market", limitPrice: null, filledQty: 2, filledUsd: 200 };
const input = { amountUsd: 10, stopPrice: 90, targetPrice: 120 };

test("an unfilled limit copies at its price, anything filled copies at market", () => {
  assert.equal(copyMode(open), "limit");
  assert.equal(copyMode(filled), "market");
  assert.equal(copyMode({ ...open, status: "ORDER_STATUS_PARTIALLY_FILLED", filledQty: 1, filledUsd: 100 }), "market");
});

test("the entry is the fill price once filled", () => {
  assert.equal(entryPrice(open), 100);
  assert.equal(entryPrice({ ...filled, filledUsd: 210 }), 105);
});

test("open and held trades can be copied", () => {
  assert.equal(tradeBlock(open, 105, false), null);
  assert.equal(tradeBlock(filled, 105, true), null);
});

test("sells, other order types and unfilled closed orders can't be copied", () => {
  assert.match(tradeBlock({ ...filled, side: "sell" }, 105, true)!, /Only buys/);
  assert.match(tradeBlock({ ...open, orderType: "twap" }, 105, true)!, /can't be copied yet/);
  assert.match(tradeBlock({ ...open, status: "ORDER_STATUS_CANCELLED" }, 105, true)!, /without filling/);
});

test("copying stops once the trader has sold, or the price passed a level", () => {
  assert.match(tradeBlock(filled, 105, false)!, /already sold/);
  assert.match(tradeBlock(filled, 90, true)!, /stop/);
  assert.match(tradeBlock(filled, 120, true)!, /target/);
  assert.equal(tradeBlock({ ...filled, stopPrice: null, targetPrice: null }, 1000, true), null);
});

test("stop and target are optional, but must both be set and make sense", () => {
  assert.equal(copyInputError(open, 105, input), null);
  assert.equal(copyInputError(open, 105, { ...input, stopPrice: null, targetPrice: null }), null);
  assert.match(copyInputError(open, 105, { ...input, amountUsd: 0 })!, /amount/);
  assert.match(copyInputError(open, 105, { ...input, targetPrice: null })!, /both/);
  assert.match(copyInputError(open, 105, { ...input, stopPrice: 101 })!, /stop must/);
  assert.match(copyInputError(filled, 110, { ...input, targetPrice: 109 })!, /target must/);
  assert.match(copyInputError(open, 105, { ...input, stopPrice: Number.NaN })!, /valid/);
});
