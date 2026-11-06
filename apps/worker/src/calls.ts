export const OPEN_STATUSES = new Set(["ORDER_STATUS_PENDING", "ORDER_STATUS_ACCEPTED", "ORDER_STATUS_PARTIALLY_FILLED"]);

/** The fields we use from a Flash orders stream frame. */
export interface OrderFrame {
  orderId: string;
  orderType: string;
  side: string;
  status: string;
  closeReason?: string | null;
  funderAddress: string;
  qty: string;
  targetAsset: { ticker: string };
  filled?: { targetAmount?: string | null; contraAmount?: string | null } | null;
  attachedBracket?: { status: string; bracketOrderId: string | null };
  sourceEntryOrderId?: string;
}

interface CallState {
  status: string;
  entryPrice: number | null;
  stopPrice: number;
  targetPrice: number;
}

export type CallChange =
  | { status: "live"; entryPrice: number }
  | { status: "cancelled" }
  | { status: "target_hit" | "stopped_out" | "closed"; exitPrice: number; resultPct: number | null };

const fillPrice = (o: OrderFrame) => {
  const target = Number(o.filled?.targetAmount ?? 0);
  const contra = Number(o.filled?.contraAmount ?? 0);
  return target > 0 && contra > 0 ? contra / target : null;
};

/** What a frame for the call's entry order means. Calls are priced against USDC, so the fill rate is the USD price. */
export function entryChange(call: CallState, o: OrderFrame): CallChange | null {
  if (call.status !== "waiting") return null;
  const price = fillPrice(o);
  if (price !== null) return { status: "live", entryPrice: call.entryPrice ?? price };
  return OPEN_STATUSES.has(o.status) ? null : { status: "cancelled" };
}

/** What a frame for the call's stop and target pair means. The stream doesn't name the leg, so the nearer one is used. */
export function bracketChange(call: CallState, o: OrderFrame): CallChange | null {
  if (call.status !== "live" || o.status !== "ORDER_STATUS_FILLED") return null;
  const exitPrice = fillPrice(o);
  if (exitPrice === null) return null;
  const nearTarget = Math.abs(exitPrice - call.targetPrice) < Math.abs(exitPrice - call.stopPrice);
  const resultPct = call.entryPrice ? ((exitPrice - call.entryPrice) / call.entryPrice) * 100 : null;
  return { status: nearTarget ? "target_hit" : "stopped_out", exitPrice, resultPct };
}

const usd = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: n < 10 ? 4 : 2 })}`;
const pct = (n: number | null) => (n === null ? "" : ` (${n >= 0 ? "+" : ""}${n.toFixed(1)}%)`);

export function publishedAlert(trader: string, c: { tokenSymbol: string; chain: string; entryType: string; entryPrice: number | null; stopPrice: number; targetPrice: number }) {
  const entry = c.entryPrice ? usd(c.entryPrice) : "market";
  return `New call from ${trader}\nLong ${c.tokenSymbol} on ${c.chain}\nEntry ${entry} · Stop ${usd(c.stopPrice)} · Target ${usd(c.targetPrice)}`;
}

export function changeAlert(trader: string, token: string, change: CallChange) {
  switch (change.status) {
    case "live": return `${trader}'s ${token} call filled at ${usd(change.entryPrice)}. Stop and target are active.`;
    case "cancelled": return `${trader} cancelled their ${token} call.`;
    case "target_hit": return `Target hit: ${trader}'s ${token} call closed at ${usd(change.exitPrice)}${pct(change.resultPct)}.`;
    case "stopped_out": return `Stopped out: ${trader}'s ${token} call closed at ${usd(change.exitPrice)}${pct(change.resultPct)}.`;
    case "closed": return `${trader}'s ${token} call closed at ${usd(change.exitPrice)}${pct(change.resultPct)}.`;
  }
}

const REASONS: Record<string, string> = {
  REASON_INSUFFICIENT_FUNDER_BALANCE: "not enough balance in your wallet",
  REASON_INSUFFICIENT_ASSET_BALANCE: "not enough balance",
  REASON_MAXIMUM_SLIPPAGE_EXCEEDED: "the price moved past the slippage limit",
  REASON_EXECUTION_COST_EXCEEDS_LIMIT: "the order is too small for its execution costs",
  REASON_ORDER_REJECTED_AT_VENUE: "network congestion",
  REASON_ORDER_TRIGGERED_ON_ENTRY: "its trigger price had already been crossed",
  REASON_USER_REQUESTED: "you cancelled it",
  REASON_ORDER_EXPIRED: "it expired",
};

export function ownOrderAlert(o: OrderFrame) {
  const name = `${o.orderType} ${o.side} ${o.targetAsset.ticker}`;
  if (o.status === "ORDER_STATUS_FILLED") return `Your ${name} order filled.`;
  const why = o.closeReason ? REASONS[o.closeReason] ?? o.closeReason : undefined;
  return `Your ${name} order closed without filling${why ? `: ${why}` : ""}.`;
}
