export interface Position {
  qty: number;
  costUsd: number;
}

/** Applies a fill using average cost. Selling more than we tracked only counts the tracked part. */
export function applyFill(position: Position, side: string, qty: number, usd: number) {
  if (side === "buy") return { position: { qty: position.qty + qty, costUsd: position.costUsd + usd }, realizedUsd: 0, soldCostUsd: 0 };
  const sold = Math.min(qty, position.qty);
  if (sold <= 0) return { position, realizedUsd: 0, soldCostUsd: 0 };
  const soldCostUsd = position.costUsd * (sold / position.qty);
  const proceeds = usd * (sold / qty);
  const left = position.qty - sold;
  return {
    position: { qty: left < 1e-12 ? 0 : left, costUsd: left < 1e-12 ? 0 : position.costUsd - soldCostUsd },
    realizedUsd: proceeds - soldCostUsd,
    soldCostUsd,
  };
}
