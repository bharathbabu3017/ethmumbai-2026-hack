import assert from "node:assert/strict";
import { test } from "node:test";
import { closeReason, plainError, tradeSize } from "./format";

const order = { side: "buy", qty: "25", tokenSymbol: "WETH", filledUsd: 0, filledQty: 0 };

test("shows what filled, or what the order is for", () => {
  assert.equal(tradeSize({ ...order, filledUsd: 24.87, filledQty: 0.01 }), "$24.87");
  assert.equal(tradeSize(order), "$25");
  assert.equal(tradeSize({ ...order, side: "sell", qty: "0.012345" }), "0.01235 WETH");
  assert.equal(tradeSize({ ...order, side: "sell", qty: "1", filledUsd: 2400, filledQty: 1 }), "$2,400");
});

test("wallet errors become plain messages", () => {
  assert.match(plainError({ code: 4001, message: "x" }), /cancelled in your wallet/);
  assert.match(plainError({ shortMessage: "User rejected the request." }), /cancelled in your wallet/);
  assert.equal(plainError(new Error("Request failed\nVersion: viem@2")), "Request failed");
});

test("close reasons read plainly, even unknown ones", () => {
  assert.match(closeReason("REASON_INSUFFICIENT_FUNDER_BALANCE"), /Not enough/);
  assert.equal(closeReason("REASON_SOMETHING_NEW"), "The order couldn't be completed.");
  assert.equal(closeReason(null), "");
});
