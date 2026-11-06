import assert from "node:assert/strict";
import { test } from "node:test";
import { ChartBusy, createChartData, NoMarketData } from "./chart-data";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const ohlcv = { data: { attributes: { ohlcv_list: [[100, 1, 2, 1, 2, 9]] } } };
const pairs = [
  { pairAddress: "0x" + "a".repeat(40), liquidity: { usd: 5 } },
  { pairAddress: "0x" + "b".repeat(40), liquidity: { usd: 50 } },
  { pairAddress: "0x" + "c".repeat(64), liquidity: { usd: 500 } },
];

function setup(respond: (url: string) => Response | Promise<Response>) {
  const calls: string[] = [];
  const clock = { t: 0 };
  const fetcher = (async (input: string) => { calls.push(input); return respond(input); }) as unknown as typeof fetch;
  return { calls, clock, get: createChartData(fetcher, () => clock.t) };
}
const dex = (u: string) => u.includes("dexscreener");
const candleCalls = (calls: string[]) => calls.filter((c) => c.includes("/ohlcv/")).length;

test("uses the most liquid pool GeckoTerminal can read, found through DexScreener", async () => {
  const { calls, get } = setup((u) => (dex(u) ? json(pairs) : json(ohlcv)));
  assert.equal((await get("0xT", "1h")).length, 1);
  assert.ok(calls.some((c) => c.includes(`/pools/0x${"b".repeat(40)}/ohlcv/hour`)));
  assert.ok(!calls.some((c) => c.includes("/tokens/")));
});

test("repeat views within a minute cost nothing, and the pool is remembered after that", async () => {
  const { calls, clock, get } = setup((u) => (dex(u) ? json(pairs) : json(ohlcv)));
  await get("0xT", "1h");
  await get("0XT", "1h");
  assert.equal(calls.length, 2);
  clock.t = 61_000;
  await get("0xT", "1h");
  assert.deepEqual([calls.filter(dex).length, candleCalls(calls)], [1, 2]);
});

test("simultaneous requests share one call", async () => {
  const { calls, get } = setup((u) => (dex(u) ? json(pairs) : json(ohlcv)));
  await Promise.all([get("0xT", "1h"), get("0xT", "1h"), get("0xT", "1h")]);
  assert.equal(candleCalls(calls), 1);
});

test("a rate limit is reported as busy, never as no market data", async () => {
  const { get } = setup((u) => (dex(u) ? json(pairs) : json({}, 429)));
  await assert.rejects(get("0xT", "1h"), ChartBusy);
});

test("after a rate limit it waits instead of calling again, then recovers", async () => {
  let limited = true;
  const { calls, clock, get } = setup((u) => (dex(u) ? json(pairs) : limited ? json({}, 429) : json(ohlcv)));
  await assert.rejects(get("0xT", "1h"), ChartBusy);
  await assert.rejects(get("0xU", "1h"), ChartBusy);
  assert.equal(candleCalls(calls), 1);
  limited = false;
  clock.t = 21_000;
  assert.equal((await get("0xT", "1h")).length, 1);
});

test("when rate limited, recent candles are still shown", async () => {
  let limited = false;
  const { clock, get } = setup((u) => (dex(u) ? json(pairs) : limited ? json({}, 429) : json(ohlcv)));
  await get("0xT", "1h");
  limited = true;
  clock.t = 61_000;
  assert.equal((await get("0xT", "1h")).length, 1);
});

test("a token with no pools or no candles is reported as no market data", async () => {
  const noPools = setup((u) => (dex(u) ? json([]) : json({}, 404)));
  await assert.rejects(noPools.get("0xT", "1h"), NoMarketData);
  const noCandles = setup((u) => (dex(u) ? json(pairs) : json({ data: { attributes: { ohlcv_list: [] } } })));
  await assert.rejects(noCandles.get("0xT", "1h"), NoMarketData);
});

test("a token with no pools doesn't spend a GeckoTerminal call", async () => {
  const { calls, get } = setup((u) => (dex(u) ? json([]) : json({}, 429)));
  await assert.rejects(get("0xT", "1h"), NoMarketData);
  assert.equal(calls.filter((c) => !dex(c)).length, 0);
});

test("falls back to GeckoTerminal's pool lookup if DexScreener is down", async () => {
  const { get } = setup((u) => {
    if (dex(u)) return json({}, 500);
    if (u.includes("/tokens/")) return json({ data: [{ attributes: { address: "0xpool" } }] });
    return json(ohlcv);
  });
  assert.equal((await get("0xT", "1h")).length, 1);
});
