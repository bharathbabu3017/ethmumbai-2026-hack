import type { OrderFields } from "@flashmob/db";
import { OPEN_STATUSES as OPEN_ORDER_STATUSES, signedUsd, USDC_BASE, type holdings } from "@flashmob/flash";

export const OPEN_STATUSES = new Set(OPEN_ORDER_STATUSES);

interface Asset {
  ticker: string;
  address: string;
  chain: string | { name: string };
}

interface Leg {
  notionalPrice?: string;
  crossPrice?: string;
  triggerType?: string;
}

/** The fields we use from a Flash orders stream frame. */
export interface OrderFrame {
  orderId: string;
  orderType: string;
  side: string;
  status: string;
  closeReason?: string | null;
  funderAddress: string;
  qty: string;
  targetAsset: Asset;
  contraAsset: Asset;
  filled?: { targetAmount?: string | null; contraAmount?: string | null } | null;
  limitNotionalPrice?: string | null;
  limitCrossPrice?: string | null;
  trigger?: Leg | null;
  brackets?: Leg[] | null;
  attachedBracket?: { status: string; bracketOrderId: string | null };
  sourceEntryOrderId?: string;
  placedAt?: string;
}

export interface Levels {
  stop: number | null;
  target: number | null;
}

const price = (leg?: Leg | null) => {
  const n = Number(leg?.notionalPrice ?? leg?.crossPrice);
  return n > 0 ? n : null;
};

function frameLevels(o: OrderFrame): Levels {
  const legs = [...(o.brackets ?? []), ...(o.trigger ? [o.trigger] : [])];
  return { stop: price(legs.find((l) => l.triggerType === "lower")), target: price(legs.find((l) => l.triggerType === "upper")) };
}

export function orderFields(o: OrderFrame, owner: { userId: string; walletId: string }, isPublic: boolean, attached?: Levels): OrderFields {
  const usdPriced = o.contraAsset.address.toLowerCase() === USDC_BASE.toLowerCase();
  const levels = attached ?? frameLevels(o);
  const limit = Number(o.limitNotionalPrice ?? o.limitCrossPrice);
  const { chain } = o.targetAsset;
  return {
    id: o.orderId,
    ...owner,
    isPublic,
    status: o.status,
    raw: o,
    side: o.side,
    orderType: o.orderType,
    chain: typeof chain === "string" ? chain : chain.name,
    tokenSymbol: o.targetAsset.ticker,
    tokenAddress: o.targetAsset.address,
    qty: o.qty,
    limitPrice: limit > 0 ? limit : null,
    stopPrice: levels.stop,
    targetPrice: levels.target,
    entryOrderId: o.sourceEntryOrderId ?? null,
    filledQty: Number(o.filled?.targetAmount ?? 0),
    filledUsd: usdPriced ? Number(o.filled?.contraAmount ?? 0) : 0,
    usdPriced,
    placedAt: o.placedAt ? new Date(o.placedAt) : null,
  };
}

const usd = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: n < 10 ? 4 : 2 })}`;

interface TradeRow {
  status: string | null;
  side: string | null;
  orderType: string | null;
  tokenSymbol: string | null;
  qty: string | null;
  limitPrice: number | null;
  stopPrice: number | null;
  targetPrice: number | null;
  entryOrderId: string | null;
  filledQty: number;
  filledUsd: number;
  realizedUsd: number;
  soldCostUsd: number;
}

const signedPct = (t: TradeRow) => {
  if (t.soldCostUsd <= 0) return "";
  const pct = (t.realizedUsd / t.soldCostUsd) * 100;
  return ` · ${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
};

const fillLine = (t: TradeRow) => (t.filledQty > 0 && t.filledUsd > 0 ? `${usd(t.filledUsd)} at ${usd(t.filledUsd / t.filledQty)}` : "");

/** What followers should hear about this frame, if anything. */
export function tradeAlert(trader: string, t: TradeRow, change: { isNew: boolean; statusChanged: boolean }) {
  const token = t.tokenSymbol;
  const exitPair = t.orderType === "bracket" && t.entryOrderId;
  if (t.status === "ORDER_STATUS_FILLED" && change.statusChanged) {
    if (t.side === "buy") return `🟢 ${trader} bought ${token}\n${fillLine(t)}`.trim();
    return `🔴 ${trader} sold ${token}\n${fillLine(t)}${signedPct(t)}`.trim();
  }
  if (!OPEN_STATUSES.has(t.status ?? "") && change.statusChanged) {
    if (exitPair) return null;
    return t.filledQty > 0 ? `⚪ ${trader} cancelled the rest of their ${t.orderType} ${t.side} of ${token}` : `⚪ ${trader} cancelled their ${t.orderType} ${t.side} of ${token}`;
  }
  // A market order fills in moments, so its fill is the alert.
  if (change.isNew && t.orderType !== "market" && !exitPair) {
    const size = t.side === "buy" ? `$${t.qty}` : `${t.qty} ${token}`;
    const at = t.limitPrice ? ` at ${usd(t.limitPrice)}` : "";
    const exits = [t.stopPrice && `Stop ${usd(t.stopPrice)}`, t.targetPrice && `Target ${usd(t.targetPrice)}`].filter(Boolean).join(" · ");
    return `🕓 ${trader} placed a ${t.orderType} ${t.side} of ${token}\n${size}${at}${exits ? `\n${exits}` : ""}`;
  }
  return null;
}

export function mirrorAlert(trader: string, m: { percent: number; qty: number; tokenSymbol: string }) {
  return `🔔 ${trader} sold ${m.percent.toFixed(0)}% of their ${m.tokenSymbol}\nSell the same share of your copy? That's ${Number(m.qty.toPrecision(4))} ${m.tokenSymbol}.\nOpen Flashmob to sell or keep it.`;
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

/** Tells someone what happened to their own order, with the numbers that matter. */
export function ownOrderAlert(o: OrderFrame, t?: TradeRow) {
  const token = o.targetAsset.ticker;
  if (o.status === "ORDER_STATUS_FILLED") {
    const qty = t && t.filledQty > 0 ? `${Number(t.filledQty.toPrecision(4))} ${token}` : token;
    const detail = t ? `\n${qty} for ${fillLine(t)}${o.side === "sell" ? signedPct(t) : ""}` : "";
    return `✅ Your ${token} ${o.side} filled${detail}`;
  }
  const why = o.closeReason ? REASONS[o.closeReason] ?? o.closeReason : undefined;
  return `⚠️ Your ${o.orderType} ${o.side} of ${token} closed without filling${why ? `\nReason: ${why}` : ""}`;
}

/** The /balance reply: what's held, what it's worth, and how it's doing. */
export function portfolioMessage(p: ReturnType<typeof holdings>) {
  const assets = p.rows.map((r) => `${r.symbol} $${r.valueUsd.toFixed(2)}${r.pnlUsd === null ? "" : ` (${signedUsd(r.pnlUsd)}, ${r.pnlPercent! >= 0 ? "+" : ""}${r.pnlPercent!.toFixed(1)}%)`}`);
  return [`💼 Portfolio: $${p.totalUsd.toFixed(2)}`, "", ...assets, "", `Open profit/loss: ${signedUsd(p.openPnlUsd)}`, `Realized profit/loss: ${signedUsd(p.realizedUsd)}`].join("\n");
}
