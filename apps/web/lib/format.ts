export const usd = (n: number | null) => (n === null ? "-" : `$${n.toLocaleString("en-US", { maximumFractionDigits: n < 10 ? 4 : 2 })}`);
export const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;

export const STATUS: Record<string, { label: string; color: string }> = {
  waiting: { label: "Waiting for entry", color: "var(--blue)" },
  live: { label: "Live", color: "var(--up)" },
  cancelled: { label: "Cancelled by trader", color: "var(--orange)" },
  target_hit: { label: "Hit target", color: "var(--up)" },
  stopped_out: { label: "Stopped out", color: "var(--orange)" },
  closed: { label: "Closed", color: "var(--mut)" },
};
