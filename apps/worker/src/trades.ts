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
  filled?: { targetAmount?: string | null; contraAmount?: string | null; averageNotionalPrice?: string | null } | null;
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
  // Paid in USDC, what was spent is the cost. Paid in another token, Flash's average USD price gives it.
  const qty = Number(o.filled?.targetAmount ?? 0);
  const paidInUsdc = o.contraAsset.address.toLowerCase() === USDC_BASE.toLowerCase();
  const usd = paidInUsdc ? Number(o.filled?.contraAmount ?? 0) : qty * Number(o.filled?.averageNotionalPrice ?? 0);
  const usdPriced = paidInUsdc || usd > 0;
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
    // A fill we can't value yet stays unrecorded, so the next read with a price still counts it.
    filledQty: usdPriced ? qty : 0,
    filledUsd: usdPriced ? usd : 0,
    usdPriced,
    placedAt: o.placedAt ? new Date(o.placedAt) : null,
  };
}

const usd = (n: number) => (n > 0 && n < 0.01
  ? `$${n.toLocaleString("en-US", { maximumSignificantDigits: 3, maximumFractionDigits: 20 })}`
  : `$${n.toLocaleString("en-US", { maximumFractionDigits: n < 10 ? 4 : 2 })}`);

// Amounts read like money, while prices keep the detail a small token needs.
const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const esc = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

type Row = [string, string | null | undefined | false];

/** A Telegram message: a bold title, then aligned figures so they read like a receipt. */
export function card(icon: string, title: string, rows: Row[] = [], note?: string) {
  const shown = rows.filter((r): r is [string, string] => !!r[1]);
  const width = Math.max(0, ...shown.map(([label]) => label.length));
  const body = shown.map(([label, value]) => `${label.padEnd(width + 2)}${value}`).join("\n");
  return [`${icon} <b>${esc(title)}</b>`, body && `<pre>${esc(body)}</pre>`, note && esc(note)].filter(Boolean).join("\n");
}

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

const resultOf = (t: TradeRow) => {
  if (t.soldCostUsd <= 0) return null;
  const pct = (t.realizedUsd / t.soldCostUsd) * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
};

const fillRows = (t: TradeRow): Row[] => (t.filledQty > 0 && t.filledUsd > 0 ? [["Size", money(t.filledUsd)], ["Price", usd(t.filledUsd / t.filledQty)]] : []);
const exitRows = (t: TradeRow): Row[] => [["Stop", t.stopPrice ? usd(t.stopPrice) : null], ["Target", t.targetPrice ? usd(t.targetPrice) : null]];

/** What followers should hear about this frame, if anything. `other` is the token on the far side of a swap. */
export function tradeAlert(trader: string, t: TradeRow, change: { isNew: boolean; statusChanged: boolean }, other?: string) {
  const token = t.tokenSymbol;
  const exitPair = t.orderType === "bracket" && t.entryOrderId;
  if (t.status === "ORDER_STATUS_FILLED" && change.statusChanged) {
    if (t.side === "buy") return card("🟢", `${trader} bought ${token}`, [...fillRows(t), ["Paid with", other], ...exitRows(t)]);
    return card("🔴", other ? `${trader} swapped ${token} for ${other}` : `${trader} sold ${token}`, [...fillRows(t), ["Result", resultOf(t)]]);
  }
  if (!OPEN_STATUSES.has(t.status ?? "") && change.statusChanged) {
    if (exitPair) return null;
    return card("⚪", t.filledQty > 0 ? `${trader} cancelled the rest of their ${t.orderType} ${t.side} of ${token}` : `${trader} cancelled their ${t.orderType} ${t.side} of ${token}`);
  }
  // A market order fills in moments, so its fill is the alert.
  if (change.isNew && t.orderType !== "market" && !exitPair) {
    return card("🕓", `${trader} placed a ${t.orderType} ${t.side} of ${token}`, [["Size", t.side === "buy" ? `$${t.qty}` : `${t.qty} ${token}`], ["Price", t.limitPrice ? usd(t.limitPrice) : null], ...exitRows(t)]);
  }
  return null;
}

export function mirrorAlert(trader: string, m: { percent: number; qty: number; tokenSymbol: string }) {
  return card("🔔", `${trader} sold ${m.percent.toFixed(0)}% of their ${m.tokenSymbol}`, [["Your share", `${Number(m.qty.toPrecision(4))} ${m.tokenSymbol}`]], "Sell the same share of your copy? Open Flashmob to review it.");
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

/** Tells someone what happened to their own order. `copiedFrom` names the trader when auto-copy placed it. */
export function ownOrderAlert(o: OrderFrame, t?: TradeRow, copiedFrom?: string) {
  const token = o.targetAsset.ticker;
  const swap = o.contraAsset.ticker === "USDC" ? undefined : o.contraAsset.ticker;
  if (o.status === "ORDER_STATUS_FILLED") {
    const sold = o.side === "sell";
    const done = sold ? (swap ? `Swapped ${token} for ${swap}` : `Sold ${token}`) : `Bought ${token}`;
    const title = copiedFrom ? `Auto-copied ${copiedFrom}: ${done.charAt(0).toLowerCase()}${done.slice(1)}` : done;
    const amount = t && t.filledQty > 0 ? `${Number(t.filledQty.toPrecision(4))} ${token}` : null;
    const contra = Number(o.filled?.contraAmount ?? 0);
    return card(copiedFrom ? "🔁" : "✅", title, [
      ["Amount", amount],
      [sold ? "Received" : "Paid", swap ? (contra > 0 && `${Number(contra.toPrecision(4))} ${swap}`) : t?.filledUsd ? money(t.filledUsd) : null],
      ["Price", t && t.filledQty > 0 && t.filledUsd > 0 ? usd(t.filledUsd / t.filledQty) : null],
      ["Result", sold && t ? resultOf(t) : null],
    ]);
  }
  const why = o.closeReason ? REASONS[o.closeReason] ?? o.closeReason : undefined;
  return card("⚠️", `Your ${o.orderType} ${o.side} of ${token} didn't fill`, [], why && `Reason: ${why}`);
}

/** The /balance reply: what's held, what it's worth, and how it's doing. */
export function portfolioMessage(p: ReturnType<typeof holdings>) {
  const assets: Row[] = p.rows.map((r) => [r.symbol, `$${r.valueUsd.toFixed(2)}${r.pnlUsd === null ? "" : `  ${signedUsd(r.pnlUsd)} (${r.pnlPercent! >= 0 ? "+" : ""}${r.pnlPercent!.toFixed(1)}%)`}`]);
  return `${card("💼", `Portfolio: $${p.totalUsd.toFixed(2)}`, assets)}\n${card("📊", "Profit and loss", [["Open", signedUsd(p.openPnlUsd)], ["Realized", signedUsd(p.realizedUsd)]])}`;
}
