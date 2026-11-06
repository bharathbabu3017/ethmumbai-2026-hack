"use client";

import { holdings, OPEN_STATUSES, signedUsd, type FlashOrder, type Holding } from "@flashmob/flash";
import { useCallback, useEffect, useState } from "react";
import { OpenOrders } from "@/components/open-orders";
import { SwapIcons, TokenIcon } from "@/components/token-icon";
import { When } from "@/components/when";
import { useCached } from "@/lib/cached";
import { flash } from "@/lib/flash";
import { pct, tradeStatus, usd } from "@/lib/format";
import { useLiveOrders } from "@/lib/order-stream";
import { useWallet } from "@/lib/wallet";

const empty = { margin: 0, paddingTop: 12, borderTop: "1px solid var(--line)" };

export function OrderHistory({ reloadKey = 0 }: { reloadKey?: number }) {
  const { address } = useWallet();
  const [orders, setOrders] = useState<FlashOrder[]>();
  const [failed, setFailed] = useState(false);
  // Flash's status filter refuses some final statuses, such as rejected, so closed orders are picked out here.
  const load = useCallback(() => {
    if (!address) return;
    flash.listOrders({ funderAddress: address, pageSize: 50 })
      .then((r) => {
        setOrders(r.orders.filter((o) => !OPEN_STATUSES.includes(o.status)));
        setFailed(false);
      })
      .catch(() => setFailed(true));
  }, [address]);
  useEffect(load, [load, reloadKey]);
  useLiveOrders(load);

  if (failed && !orders) return <p className="dn" style={empty}>Couldn&apos;t load your order history.</p>;
  if (!orders) return <p className="mut" style={empty}>Loading…</p>;
  if (!orders.length) return <p className="mut" style={empty}>Filled and cancelled orders appear here.</p>;
  return orders.map((o) => {
    const filledQty = Number(o.filled?.targetAmount ?? 0);
    const status = tradeStatus(o.status, filledQty);
    const price = Number(o.filled?.averageNotionalPrice ?? 0);
    const target = { symbol: o.targetAsset.ticker, address: o.targetAsset.address };
    const contra = { symbol: o.contraAsset.ticker, address: o.contraAsset.address };
    const swap = contra.symbol !== "USDC";
    const [from, to] = o.side === "sell" ? [target, contra] : [contra, target];
    const contraQty = Number(o.filled?.contraAmount ?? 0);
    const [fromQty, toQty] = o.side === "sell" ? [filledQty, contraQty] : [contraQty, filledQty];
    return (
      <div key={o.orderId} className="between" style={{ padding: "10px 0", borderTop: "1px solid var(--line)", alignItems: "center" }}>
        <span className="row" style={{ gap: 10, flexWrap: "nowrap", minWidth: 0 }}>
          {swap ? <SwapIcons from={from} to={to} size={26} /> : <TokenIcon token={target} size={26} />}
          <span style={{ minWidth: 0 }}>
            <span className="row" style={{ gap: 8 }}>
              {swap ? <span style={{ fontWeight: 500 }}>{from.symbol} → {to.symbol}</span> : <><span className={`badge ${o.side === "sell" ? "sell" : "buy"}`}>{o.side}</span><span style={{ fontWeight: 500 }}>{target.symbol}</span></>}
              <span className="mut" style={{ textTransform: "capitalize" }}>{swap ? "Swap" : o.orderType}</span>
            </span>
            <span className="mut" style={{ display: "block", fontSize: 12 }}><When at={o.placedAt} /></span>
          </span>
        </span>
        <span style={{ textAlign: "right" }}>
          <span style={{ display: "block", fontSize: 12, color: status.color }}>{status.label}</span>
          {swap && filledQty > 0 ? <span className="m mut" style={{ fontSize: 12 }}>{fromQty.toPrecision(4)} {from.symbol} → {toQty.toPrecision(4)} {to.symbol}</span>
            : price > 0 && <span className="m mut" style={{ fontSize: 12 }}>{usd(filledQty * price)} · {filledQty.toPrecision(4)} at {usd(price)}</span>}
        </span>
      </div>
    );
  });
}

function Positions({ reloadKey, onSell }: { reloadKey: number; onSell?(holding: Holding): void }) {
  const { address } = useWallet();
  const { data: rows, refresh } = useCached<Holding[]>(address ? `positions:${address}` : null, async () => {
    const [{ balances }, paid] = await Promise.all([
      flash.balances(address!),
      fetch("/api/portfolio").then((r) => (r.ok ? r.json() : { positions: [], realizedUsd: 0 })),
    ]);
    // Tokens stay listed while their cost is still being recorded, so a new position doesn't pop in and out.
    return holdings(balances, paid.positions, paid.realizedUsd).rows.filter((r) => r.chain === "base" && !r.isCash);
  });
  useEffect(refresh, [refresh, reloadKey]);
  useLiveOrders(refresh);

  if (!rows) return <p className="mut" style={empty}>Loading…</p>;
  if (!rows.length) return <p className="mut" style={empty}>Tokens you buy here appear with their profit or loss.</p>;
  return rows.map((r) => (
    <div key={r.key} className="between" style={{ padding: "10px 0", borderTop: "1px solid var(--line)", alignItems: "center" }}>
      <span className="row" style={{ gap: 10 }}><TokenIcon token={r} size={26} /><span><span style={{ fontWeight: 500 }}>{r.symbol}</span> <span className="m mut" style={{ fontSize: 12 }}>{r.qty.toPrecision(4)}</span></span></span>
      <span className="row" style={{ gap: 16 }}>
        <span style={{ textAlign: "right" }}>
          <span className="m" style={{ display: "block" }}>${r.valueUsd.toFixed(2)}</span>
          {r.pnlUsd === null ? <span className="m mut" style={{ fontSize: 12 }}>-</span> : <span className={`m ${r.pnlUsd < 0 ? "dn" : "up"}`} style={{ fontSize: 12 }}>{signedUsd(r.pnlUsd)} ({pct(r.pnlPercent!)})</span>}
        </span>
        {onSell && <button className="btn" onClick={() => onSell(r)}>Sell</button>}
      </span>
    </div>
  ));
}

const TABS = ["Positions", "Pending orders", "Order history"] as const;

export type OrdersTab = (typeof TABS)[number];

export function OrdersPanel({ reloadKey, focus, onSell }: { reloadKey: number; focus?: OrdersTab; onSell?(holding: Holding): void }) {
  const { address } = useWallet();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Positions");
  const [pending, setPending] = useState(0);
  useEffect(() => {
    if (focus) setTab(focus);
  }, [focus]);

  return (
    <section>
      <div role="tablist" className="row" style={{ gap: 20, marginBottom: 14 }}>
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={t === tab} className={`tab ${t === tab ? "active" : ""}`} onClick={() => setTab(t)}>
            {t}{t === "Pending orders" && pending > 0 ? ` (${pending})` : ""}
          </button>
        ))}
      </div>
      {!address ? (
        <p className="mut" style={empty}>Connect a wallet to see your orders.</p>
      ) : (
        <>
          {/* Stays mounted so the pending count is right on every tab. */}
          <div hidden={tab !== "Pending orders"}><OpenOrders reloadKey={reloadKey} onCount={setPending} /></div>
          {tab === "Order history" && <OrderHistory reloadKey={reloadKey} />}
          {tab === "Positions" && <Positions reloadKey={reloadKey} onSell={onSell} />}
        </>
      )}
    </section>
  );
}
