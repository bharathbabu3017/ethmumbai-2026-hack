export const OPEN_STATUSES = ["ORDER_STATUS_PENDING", "ORDER_STATUS_ACCEPTED", "ORDER_STATUS_PARTIALLY_FILLED"];

export interface CopyableTrade {
  side: string | null;
  status: string | null;
  orderType: string | null;
  limitPrice: number | null;
  stopPrice: number | null;
  targetPrice: number | null;
  filledQty: number;
  filledUsd: number;
}

const isOpen = (t: CopyableTrade) => OPEN_STATUSES.includes(t.status ?? "");

export const entryPrice = (t: CopyableTrade) => (t.filledQty > 0 ? t.filledUsd / t.filledQty : t.limitPrice);

/** A limit order that hasn't filled copies at its price. Anything already filled copies at the current market. */
export const copyMode = (t: CopyableTrade) => (isOpen(t) && t.orderType === "limit" && t.filledQty === 0 ? ("limit" as const) : ("market" as const));

/** Why a trade can't be copied right now, or null if it can. */
export function tradeBlock(t: CopyableTrade, price: number, traderStillHolds: boolean) {
  if (t.side !== "buy") return "Only buys can be copied.";
  if (t.orderType !== "market" && t.orderType !== "limit") return "This order type can't be copied yet.";
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
  if (!(stop > 0) || !(target > 0)) return "Enter a valid stop and target.";
  const entry = copyMode(t) === "limit" ? t.limitPrice! : price;
  if (stop >= entry) return "Your stop must be below the entry.";
  if (target <= entry) return "Your target must be above the entry.";
  return null;
}
