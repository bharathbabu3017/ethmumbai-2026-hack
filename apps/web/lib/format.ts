export const usd = (n: number | null) => (n === null ? "-" : `$${n.toLocaleString("en-US", { maximumFractionDigits: n < 10 ? 4 : 2 })}`);
export const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;

const OPEN = ["ORDER_STATUS_PENDING", "ORDER_STATUS_ACCEPTED", "ORDER_STATUS_PARTIALLY_FILLED"];

/** A short label for an order's state. */
export function tradeStatus(status: string | null, filledQty: number) {
  if (status === "ORDER_STATUS_FILLED") return { label: "Filled", color: "var(--up)" };
  if (OPEN.includes(status ?? "")) return filledQty > 0 ? { label: "Part filled", color: "var(--blue)" } : { label: "Open", color: "var(--blue)" };
  return filledQty > 0 ? { label: "Part filled, closed", color: "var(--mut)" } : { label: "Cancelled", color: "var(--orange)" };
}
