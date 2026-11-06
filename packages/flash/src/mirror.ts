const DUST = 1e-9;

export interface MirrorPrompt {
  id: string;
  trader: string;
  tokenSymbol: string;
  tokenAddress: string;
  percent: number;
  qty: number;
  held: number;
  walletAddress: string;
  walletType: "bot" | "external";
  pairOrderIds: string[];
  stop: number | null;
  target: number | null;
}

/** Rounds down, so a sale can never ask for more than the wallet holds. */
export const sellAmount = (qty: number) => String(Math.floor(qty * 1e8) / 1e8);

/**
 * A stop and target can't be resized, and Flash says an exit fails entirely if the wallet holds less than its full size.
 * So they're cancelled before any sale, and replaced for whatever is left.
 */
export function mirrorPlan(m: Pick<MirrorPrompt, "qty" | "held" | "pairOrderIds" | "stop" | "target">) {
  const qty = Math.min(m.qty, m.held);
  const remaining = m.held - qty;
  const hasLevels = m.stop !== null && m.target !== null;
  return {
    sellQty: sellAmount(qty),
    cancel: m.pairOrderIds,
    protectQty: m.pairOrderIds.length > 0 && hasLevels && remaining > DUST ? sellAmount(remaining) : null,
  };
}

export function mirrorSummary(m: MirrorPrompt) {
  const plan = mirrorPlan(m);
  if (plan.protectQty) return `Your stop and target will be replaced for the ${plan.protectQty} ${m.tokenSymbol} you keep.`;
  if (plan.cancel.length) return "Your stop and target for this position will be cancelled.";
  return "";
}
