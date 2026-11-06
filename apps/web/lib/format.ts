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
