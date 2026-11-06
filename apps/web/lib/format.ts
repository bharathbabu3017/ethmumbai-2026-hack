import { OPEN_STATUSES } from "@flashmob/flash";

export const usd = (n: number | null) => (n === null ? "-" : `$${n.toLocaleString("en-US", { maximumFractionDigits: n < 10 ? 4 : 2 })}`);
export const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;


/** A short label for an order's state. */
export function tradeStatus(status: string | null, filledQty: number) {
  if (status === "ORDER_STATUS_FILLED") return { label: "Filled", color: "var(--up)" };
  if (OPEN_STATUSES.includes(status ?? "")) return filledQty > 0 ? { label: "Part filled", color: "var(--blue)" } : { label: "Open", color: "var(--blue)" };
  return filledQty > 0 ? { label: "Part filled, closed", color: "var(--mut)" } : { label: "Cancelled", color: "var(--orange)" };
}

/** How big a trade is: what actually filled if anything has, otherwise what the order is for. */
export function tradeSize(o: { side: string | null; qty: string | null; tokenSymbol: string | null; filledUsd: number; filledQty: number }) {
  if (o.filledUsd > 0) return `$${o.filledUsd.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  if (o.side === "buy") return `$${Number(o.qty).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  return `${Number(o.qty).toPrecision(4)} ${o.tokenSymbol}`;
}

export const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
export const basescan = (a: string) => `https://basescan.org/address/${a}`;

const CLOSE_REASONS: Record<string, string> = {
  REASON_INSUFFICIENT_FUNDER_BALANCE: "Not enough balance in your wallet.",
  REASON_INSUFFICIENT_ASSET_BALANCE: "Not enough balance.",
  REASON_MAXIMUM_SLIPPAGE_EXCEEDED: "The price moved past the slippage limit.",
  REASON_EXECUTION_COST_EXCEEDS_LIMIT: "This order is too small for its execution costs. Try a larger amount.",
  REASON_ORDER_REJECTED_AT_VENUE: "The network was congested. Try again.",
  REASON_ORDER_TRIGGERED_ON_ENTRY: "The trigger price had already been crossed.",
  REASON_ORDER_EXPIRED: "It expired.",
  REASON_USER_REQUESTED: "You cancelled it.",
};

export const closeReason = (reason: string | null | undefined) => (reason ? CLOSE_REASONS[reason] ?? "The order couldn't be completed." : "");

/** Wallet errors are long and technical, so this keeps the useful part. */
export function plainError(e: unknown) {
  const error = e as { shortMessage?: string; message?: string; code?: number };
  const text = error?.shortMessage ?? error?.message ?? "Something went wrong";
  if (error?.code === 4001 || /user (rejected|denied)|rejected the request/i.test(text)) return "You cancelled in your wallet. Nothing was placed.";
  return text.split("\n")[0]!.slice(0, 160);
}
