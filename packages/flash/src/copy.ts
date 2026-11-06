import { OPEN_STATUSES } from "./client";

export interface CopyableTrade {
  side: string | null;
  trigger?: { price: string; direction: "upper" | "lower" } | null;
  trail?: { percent: string; activationPrice: string | null } | null;
  twapMinutesLeft?: number | null;
  status: string | null;
  orderType: string | null;
  limitPrice: number | null;
  stopPrice: number | null;
  targetPrice: number | null;
  filledQty: number;
  filledUsd: number;
}

const isOpen = (t: CopyableTrade) => OPEN_STATUSES.includes(t.status ?? "");

/** Buy orders that can be copied. Sells are mirrored from what each follower holds. */
export const COPYABLE_TYPES = ["market", "limit", "stop", "twap", "trailing-stop", "trailing-stop-limit"];

export const entryPrice = (t: CopyableTrade) => (t.filledQty > 0 ? t.filledUsd / t.filledQty : t.limitPrice);

const MIN_TWAP_MINUTES = 5;

/** How a trade copies. An order that hasn't filled copies as the same order. Anything already filled copies at market. */
export function copyMode(t: CopyableTrade) {
  if (!isOpen(t) || t.filledQty > 0) return "market" as const;
  if (t.orderType === "limit") return "limit" as const;
  if (t.orderType === "stop" && t.trigger) return "stop" as const;
  if (t.orderType === "twap" && (t.twapMinutesLeft ?? 0) >= MIN_TWAP_MINUTES) return "twap" as const;
  if ((t.orderType === "trailing-stop" || t.orderType === "trailing-stop-limit") && t.trail) return t.orderType;
  return "market" as const;
}

/** Flash only attaches a stop and target to market, limit and TWAP entries. */
export const canAttach = (t: CopyableTrade) => ["market", "limit", "twap"].includes(copyMode(t));

/** The trade form for a copy, so a copied order is built by the same rules as a manual one. */
export function copyForm(t: CopyableTrade, input: { qty: string; stop: string; target: string }) {
  const type = copyMode(t);
  const protect = canAttach(t) ? { stop: input.stop, target: input.target } : {};
  const base = { side: "buy" as const, qty: input.qty, type, ...protect };
  if (type === "limit") return { ...base, price: String(t.limitPrice) };
  if (type === "stop") return { ...base, trigger: t.trigger!.price, triggerDirection: t.trigger!.direction };
  if (type === "twap") return { ...base, durationMinutes: String(Math.floor(t.twapMinutesLeft!)), ...(t.limitPrice ? { price: String(t.limitPrice) } : {}) };
  if (type === "trailing-stop" || type === "trailing-stop-limit") {
    return { ...base, trailPercent: String(Number(t.trail!.percent) * 100), activationPrice: t.trail!.activationPrice ?? "" };
  }
  return base;
}

/** A short description of what the copy will do. */
export function copySummary(t: CopyableTrade) {
  switch (copyMode(t)) {
    case "limit": return `Limit order at $${t.limitPrice}. It fills if the price gets there.`;
    case "stop": return `Stop buy at $${t.trigger!.price}. It buys when the price ${t.trigger!.direction === "upper" ? "rises" : "falls"} to that level.`;
    case "twap": return `TWAP over the ${Math.floor(t.twapMinutesLeft!)} minutes the trader's order has left.`;
    case "trailing-stop": return `Trailing stop with a ${Number(t.trail!.percent) * 100}% trail, at market.`;
    case "trailing-stop-limit": return `Trailing stop limit with a ${Number(t.trail!.percent) * 100}% trail.`;
    default: return "Market order at the current price.";
  }
}

/** Why a trade can't be copied right now, or null if it can. */
export function tradeBlock(t: CopyableTrade, price: number, traderStillHolds: boolean) {
  if (t.side !== "buy") return "Only buys can be copied.";
  if (!COPYABLE_TYPES.includes(t.orderType ?? "")) return "This order type can't be copied yet.";
  if (t.filledQty === 0 && !isOpen(t)) return "This order closed without filling.";
  if (t.filledQty > 0 && !traderStillHolds) return "The trader has already sold this position.";
  if (t.stopPrice !== null && price <= t.stopPrice) return "Price has passed the stop, so copying now would stop you out straight after entry.";
  if (t.targetPrice !== null && price >= t.targetPrice) return "Price has passed the target, so there's nothing left to copy.";
  return null;
}

/** Checks the follower's amount, and their stop and target if they set them. A bracket needs both or neither. */
export function copyInputError(t: CopyableTrade, price: number, input: { amountUsd: number; stopPrice: number | null; targetPrice: number | null }) {
  if (!(input.amountUsd > 0)) return "Enter an amount.";
  const { stopPrice: stop, targetPrice: target } = input;
  if ((stop === null) !== (target === null)) return "Set both a stop and a target, or leave both empty.";
  if (stop === null || target === null) return null;
  if (!canAttach(t)) return "This order type can't carry a stop and target.";
  if (!(stop > 0) || !(target > 0)) return "Enter a valid stop and target.";
  const entry = copyMode(t) === "limit" ? t.limitPrice! : price;
  if (stop >= entry) return "Your stop must be below the entry.";
  if (target <= entry) return "Your target must be above the entry.";
  return null;
}

export type CopySizing = "fixed" | "percent";
export type CopyExits = "trader" | "custom" | "none";

export interface CopySettings {
  enabled: boolean;
  sizing: CopySizing;
  amountUsd: number;
  percentOfBalance: number;
  maxPerTradeUsd: number;
  dailyCapUsd: number;
  exits: CopyExits;
  stopPercent: number | null;
  targetPercent: number | null;
  maxSlippagePercent: number | null;
  maxEntryDriftPercent: number;
  autoSell: boolean;
  skipRiskyTokens: boolean;
  blockedTokens: string[];
}

export const DEFAULT_COPY_SETTINGS: CopySettings = {
  enabled: false,
  sizing: "fixed",
  amountUsd: 5,
  percentOfBalance: 5,
  maxPerTradeUsd: 100,
  dailyCapUsd: 20,
  exits: "trader",
  stopPercent: null,
  targetPercent: null,
  maxSlippagePercent: null,
  maxEntryDriftPercent: 2,
  autoSell: true,
  skipRiskyTokens: true,
  blockedTokens: [],
};

const between = (n: number, min: number, max: number) => Number.isFinite(n) && n >= min && n <= max;

/** Why these settings can't be saved, or null if they're fine. */
export function settingsError(s: CopySettings) {
  if (!["fixed", "percent"].includes(s.sizing)) return "Choose how to size copies.";
  if (s.sizing === "fixed" && !between(s.amountUsd, 1, 100_000)) return "Amount per trade must be at least $1.";
  if (s.sizing === "percent" && !between(s.percentOfBalance, 0.1, 100)) return "Percent of balance must be between 0.1% and 100%.";
  if (s.sizing === "percent" && !between(s.maxPerTradeUsd, 1, 100_000)) return "Set a maximum per trade of at least $1.";
  if (!between(s.dailyCapUsd, 1, 1_000_000)) return "Daily limit must be at least $1.";
  if (!["trader", "custom", "none"].includes(s.exits)) return "Choose how to handle exits.";
  if (s.exits === "custom") {
    if (s.stopPercent === null || !between(s.stopPercent, 0.5, 90)) return "Stop loss must be between 0.5% and 90%.";
    if (s.targetPercent === null || !between(s.targetPercent, 0.5, 1000)) return "Take profit must be between 0.5% and 1000%.";
  }
  if (s.maxSlippagePercent !== null && !between(s.maxSlippagePercent, 0.1, 50)) return "Max slippage must be between 0.1% and 50%.";
  if (!between(s.maxEntryDriftPercent, 0, 50)) return "Max price difference must be between 0% and 50%.";
  return null;
}

export interface CopyContext {
  price: number;
  usdcBalance: number;
  spentLast24hUsd: number;
  tokenSymbol: string;
  tokenFlagged: boolean;
}

const MIN_COPY_USD = 1;
const money = (n: number) => `$${n.toFixed(2)}`;

/** Decides whether to auto-copy a trade, and how much to spend. Every reason for skipping is shown to the follower. */
export function decideCopy(s: CopySettings, t: CopyableTrade, c: CopyContext): { skip: string } | { amountUsd: number; stop: string; target: string; maxSlippagePercent?: string } {
  const blocked = tradeBlock(t, c.price, true);
  if (blocked) return { skip: blocked };
  if (s.blockedTokens.some((b) => b.toLowerCase() === c.tokenSymbol.toLowerCase())) return { skip: `${c.tokenSymbol} is on your blocked list.` };
  if (s.skipRiskyTokens && c.tokenFlagged) return { skip: `${c.tokenSymbol} is flagged as risky.` };

  const entry = entryPrice(t);
  if (entry && copyMode(t) === "market") {
    const drift = ((c.price - entry) / entry) * 100;
    if (drift > s.maxEntryDriftPercent) return { skip: `The price is ${drift.toFixed(1)}% above the trader's entry, past your ${s.maxEntryDriftPercent}% limit.` };
  }

  const wanted = s.sizing === "fixed" ? s.amountUsd : Math.min((c.usdcBalance * s.percentOfBalance) / 100, s.maxPerTradeUsd);
  const left = s.dailyCapUsd - c.spentLast24hUsd;
  if (left < MIN_COPY_USD) return { skip: `You've reached your ${money(s.dailyCapUsd)} daily limit.` };
  const amountUsd = Math.floor(Math.min(wanted, left) * 100) / 100;
  if (amountUsd < MIN_COPY_USD) return { skip: `The copy would be under ${money(MIN_COPY_USD)}.` };
  if (amountUsd > c.usdcBalance) return { skip: `Not enough USDC: you need ${money(amountUsd)} and have ${money(c.usdcBalance)}.` };

  let stop = "";
  let target = "";
  if (canAttach(t)) {
    const base = copyMode(t) === "limit" ? t.limitPrice! : c.price;
    if (s.exits === "trader" && t.stopPrice !== null && t.targetPrice !== null) {
      stop = String(t.stopPrice);
      target = String(t.targetPrice);
    }
    if (s.exits === "custom") {
      stop = (base * (1 - s.stopPercent! / 100)).toPrecision(8);
      target = (base * (1 + s.targetPercent! / 100)).toPrecision(8);
    }
  }
  return { amountUsd, stop, target, ...(s.maxSlippagePercent !== null && copyMode(t) === "market" ? { maxSlippagePercent: String(s.maxSlippagePercent) } : {}) };
}
