import assert from "node:assert/strict";
import { test } from "node:test";
import type { Candle } from "./candles";
import { indicators, readIndicators, rsi, sma } from "./indicators";

const hour = 3600;
const series = (closes: number[], volume = 10): Candle[] => closes.map((close, i) => ({ time: i * hour, open: close, high: close + 1, low: close - 1, close, volume }));

test("RSI matches the textbook example", () => {
  const closes = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28];
  assert.ok(Math.abs(rsi(closes)! - 70.46) < 0.5);
});

test("RSI handles straight lines and short history", () => {
  assert.equal(rsi(Array.from({ length: 20 }, (_, i) => i)), 100);
  assert.equal(rsi(Array(20).fill(5)), 50);
  assert.equal(rsi([1, 2, 3]), null);
});

test("a moving average needs enough closes", () => {
  assert.equal(sma([1, 2, 3, 4], 2), 3.5);
  assert.equal(sma([1], 2), null);
});

test("a week of candles gives highs, lows and volume against normal", () => {
  const candles = series(Array.from({ length: 200 }, (_, i) => 100 + (i % 10)));
  candles.at(-1)!.volume = 250;
  const read = indicators(candles);
  assert.equal(read.high7d, 110);
  assert.equal(read.low7d, 99);
  assert.ok(read.volumeRatio! > 1.5);
  assert.ok(read.volatility! > 0);
});

test("too little history stays unknown instead of guessing", () => {
  const read = indicators(series([100, 101, 102]));
  assert.deepEqual([read.rsi, read.sma20, read.high7d, read.volumeRatio, read.volatility], [null, null, null, null, null]);
  assert.equal(indicators([]).high7d, null);
});

test("a timeframe that can't be read is left out", async () => {
  const read = await readIndicators(async (_t, tf) => { if (tf === "1d") throw new Error("busy"); return series([1, 2]); }, "0x", ["1h", "1d"]);
  assert.deepEqual(Object.keys(read), ["1h"]);
});
