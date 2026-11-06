import { OPEN_STATUSES } from "@flashmob/flash";

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
