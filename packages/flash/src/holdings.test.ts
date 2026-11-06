import assert from "node:assert/strict";
import { test } from "node:test";
import { holdings, signedUsd } from "./holdings";

const balance = (symbol: string, address: string, amount: string, notional: string, isNative = false) =>
  ({ chain: "base", symbol, address, balance: amount, notional, isNative }) as never;

test("profit is what it's worth now against what was paid", () => {
  const { rows, openPnlUsd } = holdings([balance("WETH", "0xAB", "2", "120")], [{ tokenAddress: "0xab", qty: 2, costUsd: 100 }], 0);
  assert.equal(rows[0]?.pnlUsd, 20);
  assert.equal(rows[0]?.pnlPercent, 20);
  assert.equal(openPnlUsd, 20);
});

test("tokens that were deposited aren't counted as profit", () => {
  const { rows, totalUsd, openPnlUsd } = holdings([balance("WETH", "0xab", "3", "150")], [{ tokenAddress: "0xab", qty: 1, costUsd: 40 }], 0);
  assert.equal(rows[0]?.pnlUsd, 10);
  assert.equal(totalUsd, 150);
  assert.equal(openPnlUsd, 10);
});

test("if some tokens left the wallet, only what's still there is compared", () => {
  const { rows } = holdings([balance("WETH", "0xab", "1", "60")], [{ tokenAddress: "0xab", qty: 2, costUsd: 100 }], 0);
  assert.equal(rows[0]?.pnlUsd, 10);
});

test("cash and native gas have no profit, dust is hidden, and the biggest comes first", () => {
  const { rows } = holdings([balance("USDC", "0xusdc", "5", "5"), balance("ETH", "0xeth", "1", "9", true), balance("DUST", "0xd", "9", "0.001")], [], -1);
  assert.deepEqual(rows.map((r) => [r.symbol, r.pnlUsd]), [["ETH", null], ["USDC", null]]);
});

test("signed amounts read clearly", () => {
  assert.deepEqual([signedUsd(1.5), signedUsd(-0.1)], ["+$1.50", "-$0.10"]);
});
