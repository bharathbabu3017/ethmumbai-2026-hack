import type { OrderRequest } from "./execute";
import { USDC_BASE } from "./tokens";

export const ORDER_TYPES = {
  market: { label: "Market", sides: ["buy", "sell"] },
  limit: { label: "Limit", sides: ["buy", "sell"] },
  stop: { label: "Stop buy", sides: ["buy"] },
  "stop-loss": { label: "Stop loss", sides: ["sell"] },
  "take-profit": { label: "Take profit", sides: ["sell"] },
  bracket: { label: "Bracket", sides: ["sell"] },
  twap: { label: "TWAP", sides: ["buy", "sell"] },
  "trailing-stop": { label: "Trailing stop", sides: ["buy", "sell"] },
  "trailing-stop-limit": { label: "Trailing stop limit", sides: ["buy", "sell"] },
} as const;

export type OrderTypeName = keyof typeof ORDER_TYPES;
export type Side = "buy" | "sell";

/** USDC on the chains a cross-chain buy can be paid from. */
export const USDC_BY_CHAIN = {
  base: USDC_BASE,
  ethereum: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  arbitrum: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  optimism: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
  polygon: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
} as const;

export type PayChain = keyof typeof USDC_BY_CHAIN;

export interface TradeForm {
  side: Side;
  type: OrderTypeName;
  tokenAddress: string;
  qty: string;
  funder: string;
  payChain?: PayChain;
  price?: string; // limit price, or the limit after a stop or take profit fires
  trigger?: string;
  stop?: string; // attached to a buy
  target?: string;
  bracketStop?: string; // on a standalone bracket, which sells a token already held
  bracketTarget?: string;
  durationMinutes?: string;
  slices?: string;
  trailPercent?: string;
  activationPrice?: string;
  expiryDays?: string;
  maxImpactPercent?: string;
  now?: number;
}

const positive = (v?: string) => !!v && /^\d*\.?\d+$/.test(v.trim()) && Number(v) > 0;

const hasBracketEntry = (type: OrderTypeName) => type === "market" || type === "limit" || type === "twap";

/** Turns the trade form into a Flash order, or a plain-English reason it can't be placed. */
export function buildOrder(f: TradeForm): { request: OrderRequest } | { error: string } {
  const { side, type } = f;
  if (!(ORDER_TYPES[type].sides as readonly string[]).includes(side)) return { error: `${ORDER_TYPES[type].label} isn't available for a ${side}.` };
  if (!positive(f.qty)) return { error: "Enter an amount." };

  const payChain = f.payChain ?? "base";
  const crossChain = payChain !== "base";
  if (crossChain && (type !== "market" || side !== "buy")) return { error: "Paying from another chain only works for market buys." };

  const request: OrderRequest = {
    targetChain: "base",
    contraChain: payChain,
    targetAsset: f.tokenAddress,
    contraAsset: USDC_BY_CHAIN[payChain],
    side,
    qty: f.qty.trim(),
    orderType: type,
  };
  if (crossChain) request.recipientAddress = f.funder;

  const protect = !!(f.stop || f.target);
  if (protect) {
    if (side !== "buy" || !hasBracketEntry(type) || crossChain) return { error: "A stop and target can only be attached to a same-chain market, limit or TWAP buy." };
    if (!positive(f.stop) || !positive(f.target) || Number(f.target) <= Number(f.stop)) return { error: "Set both a stop and a target above it, or leave both empty." };
    request.attachedBracket = { takeProfit: { notionalPrice: f.target!.trim() }, stopLoss: { notionalPrice: f.stop!.trim() } };
  }

  if (type === "limit") {
    if (!positive(f.price)) return { error: "Enter a limit price." };
    // Flash rejects limitNotionalPrice on a limit entry with a bracket. Against USDC the pair rate is the USD price.
    if (protect) request.limitCrossPrice = f.price!.trim();
    else request.limitNotionalPrice = f.price!.trim();
  }

  if (type === "stop" || type === "stop-loss" || type === "take-profit") {
    if (!positive(f.trigger)) return { error: "Enter a trigger price." };
    request.triggers = [{ notionalPrice: f.trigger!.trim(), triggerType: type === "stop-loss" ? "lower" : "upper" }];
    if (f.price) {
      if (!positive(f.price)) return { error: "Enter a valid limit price, or leave it empty." };
      request.limitNotionalPrice = f.price.trim();
    }
  }

  if (type === "bracket") {
    const stop = f.bracketStop, target = f.bracketTarget;
    if (!positive(stop) || !positive(target) || Number(target) <= Number(stop)) return { error: "Enter a stop loss and a take profit above it." };
    request.triggers = [{ notionalPrice: target!.trim(), triggerType: "upper" }, { notionalPrice: stop!.trim(), triggerType: "lower" }];
  }

  if (type === "twap") {
    const minutes = Number(f.durationMinutes);
    if (!(minutes >= 5)) return { error: "A TWAP must run for at least 5 minutes." };
    request.durationSeconds = Math.round(minutes * 60);
    if (f.slices) {
      const slices = Number(f.slices);
      if (!Number.isInteger(slices) || slices < 2 || slices > 2560) return { error: "Slices must be a whole number from 2 to 2560." };
      request.twapBucketCount = slices;
    }
  }

  if (type === "trailing-stop" || type === "trailing-stop-limit") {
    const trail = Number(f.trailPercent);
    if (!(trail >= 0.5 && trail <= 50)) return { error: "Trail must be between 0.5% and 50%." };
    request.trailingStop = { trailPercent: String(trail / 100) };
    if (f.activationPrice) {
      if (!positive(f.activationPrice)) return { error: "Enter a valid activation price, or leave it empty." };
      request.trailingStop.activationPrice = f.activationPrice.trim();
    }
  }

  if (f.expiryDays) {
    if (type === "market" || type === "twap") return { error: "This order type doesn't take an expiry." };
    const days = Number(f.expiryDays);
    if (!(days > 0)) return { error: "Enter a valid number of days, or leave expiry empty." };
    request.expireTime = new Date((f.now ?? Date.now()) + days * 86_400_000).toISOString();
  }

  if (f.maxImpactPercent) {
    if (type === "market") return { error: "Market orders use Flash's slippage setting instead." };
    const impact = Number(f.maxImpactPercent);
    if (!(impact > 0 && impact <= 100)) return { error: "Max price impact must be between 0% and 100%." };
    request.maxPriceImpact = String(impact / 100);
  }

  return { request };
}
