import assert from "node:assert/strict";
import { test } from "node:test";
import { buildOrder, USDC_BY_CHAIN, type TradeForm } from "./build";
import { buildUpdate, cancelMessage, editableFields } from "./messages";

const form = (over: Partial<TradeForm>): TradeForm => ({ side: "buy", type: "market", tokenAddress: "0xt", qty: "10", funder: "0xf", ...over });
const ok = (over: Partial<TradeForm>) => {
  const r = buildOrder(form(over));
  assert.ok("request" in r, "error" in r ? r.error : "");
  return r.request;
};
const err = (over: Partial<TradeForm>) => {
  const r = buildOrder(form(over));
  assert.ok("error" in r);
  return r.error;
};

test("a plain limit is priced in USD, but in the pair rate once a bracket is attached", () => {
  assert.equal(ok({ type: "limit", price: "2000" }).limitNotionalPrice, "2000");
  const protectedLimit = ok({ type: "limit", price: "2000", stop: "1900", target: "2500" });
  assert.equal(protectedLimit.limitCrossPrice, "2000");
  assert.equal(protectedLimit.limitNotionalPrice, undefined);
  assert.deepEqual(protectedLimit.attachedBracket, { takeProfit: { notionalPrice: "2500" }, stopLoss: { notionalPrice: "1900" } });
});

test("trigger orders fire in the right direction", () => {
  assert.equal(ok({ type: "stop", trigger: "2500" }).triggers![0]!.triggerType, "upper");
  assert.equal(ok({ type: "stop-loss", side: "sell", trigger: "1900" }).triggers![0]!.triggerType, "lower");
  assert.equal(ok({ type: "take-profit", side: "sell", trigger: "2500", price: "2490" }).limitNotionalPrice, "2490");
});

test("a standalone bracket has two opposite legs", () => {
  const t = ok({ type: "bracket", side: "sell", bracketStop: "1900", bracketTarget: "2500" }).triggers!;
  assert.deepEqual(t.map((l) => [l.triggerType, l.notionalPrice]), [["upper", "2500"], ["lower", "1900"]]);
  assert.match(err({ type: "bracket", side: "sell", bracketStop: "2600", bracketTarget: "2500" }), /above/);
});

test("TWAP and trailing limits come from the docs", () => {
  assert.equal(ok({ type: "twap", durationMinutes: "60", slices: "12" }).durationSeconds, 3600);
  assert.match(err({ type: "twap", durationMinutes: "4" }), /5 minutes/);
  assert.match(err({ type: "twap", durationMinutes: "60", slices: "1" }), /Slices/);
  assert.equal(ok({ type: "trailing-stop", side: "sell", trailPercent: "5", activationPrice: "4000" }).trailingStop!.trailPercent, "0.05");
  assert.match(err({ type: "trailing-stop", trailPercent: "0.1" }), /0\.5%/);
  assert.match(err({ type: "trailing-stop-limit", trailPercent: "60" }), /50%/);
});

test("a type is refused on the wrong side", () => {
  assert.match(err({ type: "stop-loss", trigger: "1" }), /isn't available/);
  assert.match(err({ type: "stop", side: "sell", trigger: "1" }), /isn't available/);
});

test("a stop and target only attach where Flash allows them", () => {
  assert.match(err({ stop: "1900" }), /both/);
  assert.match(err({ side: "sell", stop: "1", target: "2" }), /attached/);
  assert.match(err({ type: "stop", trigger: "2", stop: "1", target: "3" }), /attached/);
});

test("cross-chain is market buys only, paid in that chain's USDC, sent to the funder", () => {
  const r = ok({ payChain: "arbitrum" });
  assert.deepEqual([r.contraChain, r.targetChain, r.contraAsset, r.recipientAddress], ["arbitrum", "base", USDC_BY_CHAIN.arbitrum, "0xf"]);
  assert.match(err({ payChain: "arbitrum", type: "limit", price: "1" }), /market buys/);
  assert.match(err({ payChain: "arbitrum", stop: "1", target: "2" }), /same-chain/);
});

test("expiry and price impact only go where they're valid", () => {
  assert.equal(ok({ type: "limit", price: "1", expiryDays: "1", now: 0 }).expireTime, "1970-01-02T00:00:00.000Z");
  assert.match(err({ expiryDays: "1" }), /expiry/);
  assert.equal(ok({ type: "limit", price: "1", maxImpactPercent: "10" }).maxPriceImpact, "0.1");
  assert.match(err({ maxImpactPercent: "10" }), /slippage/);
});

test("amounts must be real numbers", () => {
  for (const qty of ["", "0", "-1", "abc", "1e5"]) assert.match(err({ qty }), /amount/);
});

const at = "2026-11-06T10:00:00.000Z";
const header = `Definitive Flash — Update Order\nOrder: o\nIssued At: ${at}`;

test("update messages match the formats in the docs", () => {
  const limit = buildUpdate("o", { orderType: "limit", limitCrossPrice: "2000" }, { limit: "2100" }, at);
  assert.equal(limit.message, `${header}\nLimit Cross Price: 2100`);
  assert.deepEqual(limit.body, { limitCrossPrice: "2100" });

  const stop = buildUpdate("o", { orderType: "stop-loss", trigger: { notionalPrice: "1900", triggerType: "lower" } }, { trigger: "1950" }, at);
  assert.equal(stop.message, `${header}\nTrigger Lower Notional Price: 1950`);
  assert.deepEqual(stop.body, { trigger: { notionalPrice: "1950", triggerType: "lower" } });
});

test("a bracket update signs the lower leg first and keeps each leg's limit", () => {
  const order = { orderType: "bracket", brackets: [
    { notionalPrice: "2500", triggerType: "upper" as const },
    { notionalPrice: "1900", triggerType: "lower" as const, limitPrice: "1880" },
  ] };
  const u = buildUpdate("o", order, { stop: "1800", target: "2400" }, at);
  assert.equal(u.message, `${header}\nTrigger Lower Notional Price: 1800\nTrigger Lower Limit Price: 1880\nTrigger Upper Notional Price: 2400`);
  assert.deepEqual(u.body, { triggers: [
    { notionalPrice: "1800", triggerType: "lower", limitPrice: "1880" },
    { notionalPrice: "2400", triggerType: "upper" },
  ] });
});

test("only orders Flash can update offer an edit", () => {
  assert.deepEqual(editableFields({ orderType: "limit" }), ["limit"]);
  assert.deepEqual(editableFields({ orderType: "twap" }), []);
  assert.deepEqual(editableFields({ orderType: "trailing-stop" }), []);
  assert.deepEqual(editableFields({ orderType: "market" }), []);
});

test("the cancel message keeps its em dash", () => {
  assert.match(cancelMessage("x"), /v1 — Cancel Order/);
});
