import assert from "node:assert/strict";
import { test } from "node:test";
import type { AgentToken } from "./agent-decision";
import { checkRules, entryLabel, failedReason, entryOrders, exitLabels, exitOrders, planError, planLimitsError, planTimeframes, priceText, ruleLabel, type AgentPlan } from "./agent-plan";
import { buildOrder } from "./build";
import type { Indicators } from "./indicators";

const WETH = "0x4200000000000000000000000000000000000006";
const token: AgentToken = { symbol: "WETH", address: WETH, price: 2000, change24h: -6, volume24h: 1e6, liquidity: 5e6, heldQty: 0 };
const hourly: Indicators = { rsi: 28, sma20: 2100, sma50: 2200, high7d: 2300, low7d: 1950, volumeRatio: 1.4, volatility: 1.2 };
const plan: AgentPlan = { summary: "Buy oversold dips.", rules: [{ metric: "rsi", op: "below", value: 30 }], entry: { type: "ladder", rungs: 3, stepPercent: 1 }, exit: { stopPercent: 5, targetPercent: 8, trailPercent: 4 } };
const orders = (p: AgentPlan, usd: number) => { const r = entryOrders(p, token, { "1h": hourly }, usd); assert.ok(Array.isArray(r)); return r; };
const valid = (form: object) => assert.ok("request" in buildOrder({ ...form, tokenAddress: WETH, funder: "0xabc" } as never), JSON.stringify(buildOrder({ ...form, tokenAddress: WETH, funder: "0xabc" } as never)));

test("a good plan passes, and broken ones say why", () => {
  assert.equal(planError(plan), null);
  assert.match(planError({ ...plan, summary: " " })!, /summary/);
  assert.match(planError({ ...plan, rules: [{ metric: "magic" as never, op: "below", value: 1 }] })!, /measure/);
  assert.match(planError({ ...plan, rules: [] })!, /rule/);
  assert.match(planError({ ...plan, entry: { type: "ladder", rungs: 9, stepPercent: 1 } })!, /2 to 5/);
  assert.match(planError({ ...plan, entry: { type: "limit", offsetPercent: 90 } })!, /below the price/);
  assert.match(planError({ ...plan, entry: { type: "swap" as never } })!, /way to buy/);
  assert.match(planError({ ...plan, exit: {} })!, /way to sell/);
  assert.match(planError({ ...plan, exit: { stopPercent: 90 } })!, /stop/);
  assert.match(planError({} as AgentPlan)!, /complete/);
});

test("a repeating buy can hold with no exit and no rules", () => {
  assert.equal(planError({ summary: "Stack.", rules: [], entry: { type: "twap", durationMinutes: 120, repeatHours: 24 }, exit: {} }), null);
});

test("each ladder order must be big enough for the limits", () => {
  assert.match(planLimitsError(plan, { maxTradeUsd: 2 })!, /\$3/);
  assert.equal(planLimitsError(plan, { maxTradeUsd: 20 }), null);
});

test("rules are tested in code, and missing data never passes", () => {
  assert.deepEqual(checkRules(plan, token, { "1h": hourly }, 0).passed, true);
  assert.equal(checkRules(plan, token, { "1h": { ...hourly, rsi: 45 } }, 0).passed, false);
  const blind = checkRules(plan, token, {}, 0);
  assert.deepEqual([blind.passed, blind.checks[0]!.value], [false, "No data"]);
  assert.match(failedReason(blind.checks[0]!), /couldn't read/);
});

test("every metric reads the right number", () => {
  const passes = (metric: AgentPlan["rules"][0]["metric"], op: "above" | "below", value: number, mob = 0) => checkRules({ ...plan, rules: [{ metric, op, value }] }, token, { "1h": hourly }, mob).passed;
  assert.ok(passes("fromHigh7d", "below", -10));
  assert.ok(passes("fromLow7d", "above", 2));
  assert.ok(passes("vsSma20", "below", 0));
  assert.ok(passes("volumeRatio", "above", 1));
  assert.ok(passes("change24h", "below", -5));
  assert.ok(passes("liquidity", "above", 1e6));
  assert.ok(passes("mobBuyers", "above", 3, 3));
  assert.ok(!passes("mobBuyers", "above", 3, 2));
});

test("a rule on another timeframe reads that timeframe", () => {
  const daily = { ...plan, rules: [{ metric: "rsi" as const, timeframe: "1d" as const, op: "below" as const, value: 30 }] };
  assert.deepEqual(planTimeframes(daily), ["1h", "1d"]);
  assert.equal(checkRules(daily, token, { "1h": hourly, "1d": { ...hourly, rsi: 60 } }, 0).passed, false);
});

test("a ladder splits the amount below the price, and never spends more", () => {
  const ladder = orders(plan, 20);
  assert.deepEqual(ladder.map((o) => o.form.price), ["1980", "1960", "1940"]);
  assert.ok(ladder.reduce((sum, o) => sum + o.amountUsd, 0) <= 20);
  ladder.forEach((o) => valid(o.form));
  assert.ok("skip" in (entryOrders(plan, token, {}, 2) as object));
});

test("every entry builds a real order", () => {
  orders({ ...plan, entry: { type: "market" } }, 5).forEach((o) => valid(o.form));
  orders({ ...plan, entry: { type: "limit", offsetPercent: 2 } }, 5).forEach((o) => valid(o.form));
  orders({ ...plan, entry: { type: "twap", durationMinutes: 120 } }, 5).forEach((o) => valid(o.form));
  const breakout = orders({ ...plan, entry: { type: "breakout" } }, 5);
  assert.equal(breakout[0]!.form.trigger, "2300");
  valid(breakout[0]!.form);
});

test("a breakout already passed is skipped", () => {
  assert.ok("skip" in (entryOrders({ ...plan, entry: { type: "breakout" } }, { ...token, price: 2400 }, { "1h": hourly }, 5) as object));
  assert.ok("skip" in (entryOrders({ ...plan, entry: { type: "breakout" } }, token, {}, 5) as object));
});

test("stop, target and trail split the position in half", () => {
  const exits = exitOrders(plan.exit, "WETH", 0.01, 2000, 2000);
  assert.deepEqual(exits.map((o) => [o.form.type, o.form.qty]), [["bracket", "0.005"], ["trailing-stop", "0.005"]]);
  assert.deepEqual([exits[0]!.form.bracketStop, exits[0]!.form.bracketTarget, exits[1]!.form.trailPercent], ["1900", "2160", "4"]);
  exits.forEach((o) => valid(o.form));
});

test("each kind of exit builds a real order", () => {
  for (const [exit, type] of [[{ trailPercent: 5 }, "trailing-stop"], [{ stopPercent: 5, targetPercent: 8 }, "bracket"], [{ stopPercent: 5 }, "stop-loss"], [{ targetPercent: 8 }, "take-profit"]] as const) {
    const [order] = exitOrders(exit, "WETH", 0.01, 2000, null);
    assert.equal(order!.form.type, type);
    valid(order!.form);
  }
  assert.deepEqual(exitOrders({}, "WETH", 1, 2000, null), []);
});

test("levels already passed move to the current price, so an exit can always be placed", () => {
  const [order] = exitOrders({ stopPercent: 5, targetPercent: 8 }, "WETH", 1, 1800, 2000);
  assert.deepEqual([order!.form.bracketStop, order!.form.bracketTarget], ["1710", "1944"]);
});

test("a sale rounds down, so it can't exceed what's held", () => {
  const [order] = exitOrders({ trailPercent: 5 }, "WETH", 0.1234567891, 2000, null);
  assert.equal(order!.form.qty, "0.123456");
});

test("tiny prices stay plain decimals", () => {
  assert.equal(priceText(0.00000123456789), "0.00000123457");
  assert.equal(priceText(2232.123456), "2232.12");
});

test("labels read plainly", () => {
  assert.equal(ruleLabel({ metric: "rsi", op: "below", value: 30 }), "RSI, 1h at most 30");
  assert.equal(ruleLabel({ metric: "liquidity", op: "above", value: 500000 }), "Liquidity at least $500,000");
  assert.equal(entryLabel(plan.entry), "3 limit buys, 1% apart");
  assert.deepEqual(exitLabels(plan.exit), ["Half: stop at -5%, target at +8%", "Other half: 4% trailing stop"]);
  assert.deepEqual(exitLabels({}), ["Holds what it buys"]);
});
