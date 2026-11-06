import assert from "node:assert/strict";
import { test } from "node:test";
import { isTimeframe, pricePrecision, toCandles } from "./chart";

test("candles come out oldest first with no duplicates or bad rows", () => {
  const candles = toCandles([[300, 3, 4, 2, 3, 9], [100, 1, 2, 1, 2, 9], [300, 3, 5, 2, 4, 9], [200, Number.NaN, 2, 1, 2, 9]]);
  assert.deepEqual(candles.map((c) => c.time), [100, 300]);
  assert.equal(candles[1]!.close, 4);
});

test("only known timeframes are accepted", () => {
  assert.ok(isTimeframe("1h"));
  assert.equal(isTimeframe("5y"), false);
  assert.equal(isTimeframe("constructor"), false);
  assert.equal(isTimeframe(null), false);
});

test("precision suits the price", () => {
  assert.equal(pricePrecision(75000), 2);
  assert.equal(pricePrecision(1.5), 3);
  assert.equal(pricePrecision(0.59), 4);
  assert.equal(pricePrecision(0.0008), 7);
});
