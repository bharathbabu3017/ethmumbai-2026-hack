export interface CopyableCall {
  status: string;
  entryType: string;
  entryPrice: number | null;
  stopPrice: number;
  targetPrice: number;
}

/** A call still waiting on its limit price copies at that price. Anything else copies at the current market. */
export const copyMode = (call: CopyableCall) => (call.status === "waiting" && call.entryType === "limit" ? ("limit" as const) : ("market" as const));

/** Why a call can't be copied right now, or null if it can. */
export function callBlock(call: CopyableCall, price: number) {
  if (call.status !== "waiting" && call.status !== "live") return "This call is closed.";
  if (price <= call.stopPrice) return "Price has passed the stop, so copying now would stop you out straight after entry.";
  if (price >= call.targetPrice) return "Price has passed the target, so there's nothing left to copy.";
  return null;
}

/** Checks the follower's own amount, stop and target against where their entry would be. */
export function copyInputError(call: CopyableCall, price: number, input: { amountUsd: number; stopPrice: number; targetPrice: number }) {
  if (!(input.amountUsd > 0)) return "Enter an amount.";
  if (!(input.stopPrice > 0) || !(input.targetPrice > 0)) return "Enter a stop and target.";
  const entry = copyMode(call) === "limit" ? call.entryPrice! : price;
  if (input.stopPrice >= entry) return "Your stop must be below the entry.";
  if (input.targetPrice <= entry) return "Your target must be above the entry.";
  return null;
}
