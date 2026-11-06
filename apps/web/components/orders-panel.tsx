"use client";

import { OPEN_STATUSES, type FlashBalancesResponse, type FlashOrder } from "@flashmob/flash";
import { useEffect, useState } from "react";
import { OpenOrders } from "@/components/open-orders";
import { flash } from "@/lib/flash";
import { tradeStatus, usd } from "@/lib/format";
import { useWallet } from "@/lib/wallet";

const REFRESH_MS = 5_000;
const empty = { margin: 0, paddingTop: 12, borderTop: "1px solid var(--line)" };

function History({ reloadKey }: { reloadKey: number }) {
  const { address } = useWallet();
  const [orders, setOrders] = useState<FlashOrder[]>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!address) return;
    // Flash's status filter refuses some final statuses, such as rejected, so closed orders are picked out here.
    const load = () =>
      flash.listOrders({ funderAddress: address, pageSize: 50 })
        .then((r) => {
          setOrders(r.orders.filter((o) => !OPEN_STATUSES.includes(o.status)));
          setFailed(false);
        })
        .catch(() => setFailed(true));
    void load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [address, reloadKey]);

  if (failed && !orders) return <p className="dn" style={empty}>Couldn&apos;t load your order history.</p>;
  if (!orders) return <p className="mut" style={empty}>Loading…</p>;
  if (!orders.length) return <p className="mut" style={empty}>Filled and cancelled orders appear here.</p>;
  return orders.map((o) => {
    const filledQty = Number(o.filled?.targetAmount ?? 0);
    const status = tradeStatus(o.status, filledQty);
    const price = Number(o.filled?.averageNotionalPrice ?? 0);
    return (
      <div key={o.orderId} className="between" style={{ padding: "12px 0", borderTop: "1px solid var(--line)", alignItems: "center" }}>
        <span className="row" style={{ gap: 8 }}>
          <span className={`badge ${o.side === "sell" ? "sell" : "buy"}`}>{o.side}</span>
          {o.targetAsset.ticker} <span className="mut">{o.orderType}</span>
        </span>
        <span style={{ textAlign: "right" }}>
          <span style={{ display: "block", fontSize: 12, color: status.color }}>{status.label}</span>
          {price > 0 && <span className="m mut" style={{ fontSize: 12 }}>{usd(filledQty * price)} · {filledQty.toPrecision(4)} at {usd(price)}</span>}
        </span>
      </div>
    );
  });
}

function Balances({ reloadKey }: { reloadKey: number }) {
  const { address } = useWallet();
  const [balances, setBalances] = useState<FlashBalancesResponse["balances"]>();
  useEffect(() => {
    if (address) flash.balances(address).then((r) => setBalances(r.balances)).catch(() => setBalances([]));
  }, [address, reloadKey]);

  if (!balances) return <p className="mut" style={empty}>Loading…</p>;
  if (!balances.length) return <p className="mut" style={empty}>No balances yet. Send USDC to your wallet on Base to start.</p>;
  return balances.map((b) => (
    <div key={b.chain + b.address + b.isNative} className="between" style={{ padding: "12px 0", borderTop: "1px solid var(--line)" }}>
      <span>{b.symbol} <span className="mut" style={{ fontSize: 12 }}>{b.chain}</span></span>
      <span className="m">{Number(b.balance).toPrecision(5)} <span className="mut">${Number(b.notional).toFixed(2)}</span></span>
    </div>
  ));
}

const TABS = ["Pending orders", "Order history", "Balances"] as const;

export function OrdersPanel({ reloadKey }: { reloadKey: number }) {
  const { address } = useWallet();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Pending orders");
  const [pending, setPending] = useState(0);

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
          {tab === "Order history" && <History reloadKey={reloadKey} />}
          {tab === "Balances" && <Balances reloadKey={reloadKey} />}
        </>
      )}
    </section>
  );
}
