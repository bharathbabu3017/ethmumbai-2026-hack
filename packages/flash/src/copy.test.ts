import assert from "node:assert/strict";
import { test } from "node:test";
import { canAttach, copyForm, copyInputError, copyMode, decideCopy, DEFAULT_COPY_SETTINGS, entryPrice, settingsError, tradeBlock } from "./copy";

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
  assert.match(tradeBlock({ ...open, orderType: "bracket" }, 105, true)!, /can't be copied yet/);
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

const form = { qty: "25", stop: "90", target: "120" };

test("an unfilled order copies as the same kind of order", () => {
  const stop = { ...open, orderType: "stop", trigger: { price: "130", direction: "upper" as const } };
  assert.deepEqual(copyForm(stop, form), { side: "buy", qty: "25", type: "stop", trigger: "130", triggerDirection: "upper" });
  const twap = { ...open, orderType: "twap", limitPrice: null, twapMinutesLeft: 42.7 };
  assert.deepEqual(copyForm(twap, form), { side: "buy", qty: "25", type: "twap", stop: "90", target: "120", durationMinutes: "42" });
  const trail = { ...open, orderType: "trailing-stop", trail: { percent: "0.05", activationPrice: null } };
  const built = copyForm(trail, form) as { type: string; trailPercent: string };
  assert.deepEqual([built.type, built.trailPercent], ["trailing-stop", "5"]);
});

test("a nearly finished or filled order copies at market instead", () => {
  assert.equal(copyMode({ ...open, orderType: "twap", twapMinutesLeft: 3 }), "market");
  assert.equal(copyMode({ ...open, orderType: "twap", status: "ORDER_STATUS_PARTIALLY_FILLED", filledQty: 1, filledUsd: 100, twapMinutesLeft: 30 }), "market");
});

test("a stop and target are refused where Flash can't attach them", () => {
  const stop = { ...open, orderType: "stop", trigger: { price: "130", direction: "upper" as const } };
  assert.equal(canAttach(stop), false);
  assert.match(copyInputError(stop, 105, input)!, /can't carry/);
  assert.equal(copyInputError(stop, 105, { ...input, stopPrice: null, targetPrice: null }), null);
});

const settings = { ...DEFAULT_COPY_SETTINGS, enabled: true };
const ctx = { price: 105, usdcBalance: 500, spentLast24hUsd: 0, tokenSymbol: "WETH", tokenFlagged: false };
const liveFill = { ...filled, filledUsd: 208 }; // the trader got in at $104

test("copies a fixed amount with the trader's exits by default", () => {
  assert.deepEqual(decideCopy(settings, liveFill, ctx), { amountUsd: 25, stop: "90", target: "120" });
});

test("percent sizing uses the balance and respects the per-trade maximum", () => {
  const p = { ...settings, sizing: "percent" as const, percentOfBalance: 10, maxPerTradeUsd: 30 };
  assert.equal((decideCopy(p, liveFill, ctx) as { amountUsd: number }).amountUsd, 30);
  assert.equal((decideCopy(p, liveFill, { ...ctx, usdcBalance: 200 }) as { amountUsd: number }).amountUsd, 20);
});

test("the daily limit trims a copy, then stops copying", () => {
  assert.equal((decideCopy(settings, liveFill, { ...ctx, spentLast24hUsd: 90 }) as { amountUsd: number }).amountUsd, 10);
  assert.match((decideCopy(settings, liveFill, { ...ctx, spentLast24hUsd: 100 }) as { skip: string }).skip, /daily limit/);
});

test("skips when funds, filters or price say so, with a reason", () => {
  const skip = (r: object) => (r as { skip: string }).skip;
  assert.match(skip(decideCopy(settings, liveFill, { ...ctx, usdcBalance: 10 })), /Not enough USDC/);
  assert.match(skip(decideCopy(settings, liveFill, { ...ctx, tokenFlagged: true })), /flagged/);
  assert.match(skip(decideCopy({ ...settings, blockedTokens: ["weth"] }, liveFill, ctx)), /blocked/);
  assert.match(skip(decideCopy(settings, liveFill, { ...ctx, price: 110 })), /above the trader's entry/);
  assert.match(skip(decideCopy(settings, { ...liveFill, stopPrice: 200 }, ctx)), /stop/);
  assert.match(skip(decideCopy(settings, { ...liveFill, side: "sell" }, ctx)), /Only buys/);
});

test("filters can be turned off", () => {
  assert.ok("amountUsd" in decideCopy({ ...settings, skipRiskyTokens: false }, liveFill, { ...ctx, tokenFlagged: true }));
  assert.ok("amountUsd" in decideCopy({ ...settings, maxEntryDriftPercent: 50 }, liveFill, { ...ctx, price: 110 }));
});

test("exits follow the setting", () => {
  const custom = decideCopy({ ...settings, exits: "custom", stopPercent: 10, targetPercent: 20 }, liveFill, ctx) as { stop: string; target: string };
  assert.deepEqual([Number(custom.stop), Number(custom.target)], [94.5, 126]);
  const none = decideCopy({ ...settings, exits: "none" }, liveFill, ctx) as { stop: string };
  assert.equal(none.stop, "");
  const unattachable = decideCopy({ ...settings, exits: "custom", stopPercent: 10, targetPercent: 20 }, { ...open, orderType: "stop", trigger: { price: "130", direction: "upper" as const } }, ctx) as { stop: string };
  assert.equal(unattachable.stop, "");
});

test("a slippage setting only applies to market copies", () => {
  const s = { ...settings, maxSlippagePercent: 1 };
  assert.equal((decideCopy(s, liveFill, ctx) as { maxSlippagePercent?: string }).maxSlippagePercent, "1");
  assert.equal((decideCopy(s, open, ctx) as { maxSlippagePercent?: string }).maxSlippagePercent, undefined);
});

test("bad settings are refused", () => {
  assert.equal(settingsError(settings), null);
  assert.match(settingsError({ ...settings, amountUsd: 0 })!, /at least \$1/);
  assert.match(settingsError({ ...settings, sizing: "percent", percentOfBalance: 200 })!, /Percent/);
  assert.match(settingsError({ ...settings, dailyCapUsd: 0 })!, /Daily/);
  assert.match(settingsError({ ...settings, exits: "custom" })!, /Stop loss/);
  assert.match(settingsError({ ...settings, maxSlippagePercent: 90 })!, /slippage/);
  assert.match(settingsError({ ...settings, amountUsd: Number.NaN })!, /at least/);
});
