"use client";

import { batchCancelMessage, cancelMessage, type FlashBalancesResponse, type FlashOrder } from "@flashmob/flash";
import { useCallback, useEffect, useState } from "react";
import { Nav } from "@/components/nav";
import { flash } from "@/lib/flash";
import { useWallet } from "@/lib/wallet";

const OPEN = ["ORDER_STATUS_PENDING", "ORDER_STATUS_ACCEPTED", "ORDER_STATUS_PARTIALLY_FILLED"];

export default function Portfolio() {
  const { address, getSigner } = useWallet();
  const [balances, setBalances] = useState<FlashBalancesResponse["balances"]>([]);
  const [orders, setOrders] = useState<FlashOrder[]>([]);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!address) return;
    const [b, o] = await Promise.all([flash.balances(address), flash.listOrders({ funderAddress: address, statuses: OPEN })]);
    setBalances(b.balances);
    setOrders(o.orders);
  }, [address]);

  useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, [refresh]);

  const cancel = async (orderId: string) => {
    setError("");
    try {
      const signer = await getSigner();
      const message = cancelMessage(orderId);
      await flash.cancelOrder(orderId, { cancelMessage: message, userSignature: await signer.signMessage(message) });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't cancel");
    }
  };

  const cancelAll = async () => {
    setError("");
    try {
      const signer = await getSigner();
      const orderIds = orders.slice(0, 25).map((o) => o.orderId);
      const message = batchCancelMessage(orderIds);
      await flash.cancelOrders({ orderIds, cancelMessage: message, userSignature: await signer.signMessage(message) });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't cancel");
    }
  };

  const total = balances.reduce((sum, b) => sum + Number(b.notional), 0);
  return (
    <>
      <Nav />
      <main className="wrap" style={{ paddingTop: 26, paddingBottom: 48, display: "flex", flexDirection: "column", gap: 18 }}>
        {!address ? (
          <p className="mut">Connect a wallet to see your balances and orders.</p>
        ) : (
          <>
            <div>
              <div className="mut" style={{ fontSize: 12, fontWeight: 600 }}>Total value</div>
              <div className="m" style={{ fontSize: 36, marginTop: 4 }}>${total.toFixed(2)}</div>
            </div>
            {error && <p role="alert" className="dn" style={{ margin: 0 }}>{error}</p>}
            <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12 }}>
              {balances.map((b) => (
                <div key={b.chain + b.address + b.isNative} className="card" style={{ padding: "12px 14px" }}>
                  <div className="between"><strong>{b.symbol}</strong><span className="mut" style={{ fontSize: 12 }}>{b.chain}</span></div>
                  <div className="m" style={{ marginTop: 6 }}>${Number(b.notional).toFixed(2)}</div>
                </div>
              ))}
              {!balances.length && <p className="mut">No balances yet.</p>}
            </section>
            <section className="card" style={{ overflow: "hidden" }}>
              <div className="between" style={{ padding: "12px 18px", alignItems: "center" }}>
                <h2 style={{ fontSize: 18 }}>Open orders</h2>
                {orders.length > 0 && <button className="btn warn" onClick={cancelAll}>Cancel all</button>}
              </div>
              {orders.map((o) => (
                <div key={o.orderId} className="between" style={{ padding: "12px 18px", borderTop: "1px solid var(--line)", alignItems: "center" }}>
                  <span><strong>{o.side} {o.targetAsset.ticker}</strong> <span className="mut">{o.orderType}</span></span>
                  <span className="m">{o.qty}{o.limitNotionalPrice ? ` at $${o.limitNotionalPrice}` : ""}</span>
                  <button className="btn warn" onClick={() => cancel(o.orderId)}>Cancel</button>
                </div>
              ))}
              {!orders.length && <p className="mut" style={{ padding: "0 18px 16px", margin: 0 }}>No open orders.</p>}
            </section>
          </>
        )}
      </main>
    </>
  );
}
