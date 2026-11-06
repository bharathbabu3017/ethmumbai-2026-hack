import assert from "node:assert/strict";
import { test } from "node:test";
import { tradeSize } from "./format";

const order = { side: "buy", qty: "25", tokenSymbol: "WETH", filledUsd: 0, filledQty: 0 };

test("shows what filled, or what the order is for", () => {
  assert.equal(tradeSize({ ...order, filledUsd: 24.87, filledQty: 0.01 }), "$24.87");
  assert.equal(tradeSize(order), "$25");
  assert.equal(tradeSize({ ...order, side: "sell", qty: "0.012345" }), "0.01235 WETH");
  assert.equal(tradeSize({ ...order, side: "sell", qty: "1", filledUsd: 2400, filledQty: 1 }), "$2,400");
});
