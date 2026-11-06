"use client";

import { holdings, signedUsd, type FlashBalancesResponse, type Held } from "@flashmob/flash";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Nav } from "@/components/nav";
import { OpenOrders } from "@/components/open-orders";
import { OrderHistory } from "@/components/orders-panel";
import { SellPrompts } from "@/components/sell-prompts";
import { WalletAddress } from "@/components/wallet-address";
import { flash } from "@/lib/flash";
import { pct } from "@/lib/format";
import { useLiveOrders } from "@/lib/order-stream";
import { useWallet } from "@/lib/wallet";

const pnlClass = (n: number) => (n < 0 ? "dn" : "up");

export default function Portfolio() {
  const { address } = useWallet();
  const [balances, setBalances] = useState<FlashBalancesResponse["balances"]>([]);
  const [paid, setPaid] = useState<{ positions: Held[]; realizedUsd: number }>({ positions: [], realizedUsd: 0 });
  const [error, setError] = useState("");

  const load = useCallback(() => {
    if (!address) return;
    flash.balances(address).then((b) => setBalances(b.balances)).catch((e) => setError(e.message));
    fetch("/api/portfolio").then((r) => (r.ok ? r.json() : undefined)).then((r) => r && setPaid(r)).catch(() => {});
  }, [address]);
  useEffect(load, [load]);
  useLiveOrders(load);

  const { rows, totalUsd, openPnlUsd, realizedUsd } = holdings(balances, paid.positions, paid.realizedUsd);
  const stats = [["Open profit/loss", openPnlUsd], ["Realized profit/loss", realizedUsd]] as const;
  return (
    <>
      <Nav />
      <main className="wrap" style={{ paddingTop: 44, paddingBottom: 64, display: "flex", flexDirection: "column", gap: 32 }}>
        {!address ? (
          <p className="mut">Connect a wallet to see your balances and orders.</p>
        ) : (
          <>
            <div className="row" style={{ gap: 40, alignItems: "flex-end" }}>
              <div>
                <div className="stat-label">Total value</div>
                <div className="m" style={{ fontSize: 36, marginTop: 4 }}>${totalUsd.toFixed(2)}</div>
              </div>
              {stats.map(([label, value]) => (
                <div key={label}>
                  <div className="stat-label">{label}</div>
                  <div className={`m ${pnlClass(value)}`} style={{ fontSize: 22, marginTop: 4 }}>{signedUsd(value)}</div>
                </div>
              ))}
            </div>
            {error && <p role="alert" className="dn" style={{ margin: 0 }}>{error}</p>}
            <SellPrompts />
            <div className="cols">
              <div className="main" style={{ display: "flex", flexDirection: "column", gap: 32 }}>
                <section>
                  <h2 style={{ fontSize: 18, paddingBottom: 12 }}>Assets</h2>
                  {rows.map((r) => (
                    <div key={r.key} className="between" style={{ padding: "12px 0", borderTop: "1px solid var(--line)", alignItems: "center" }}>
                      <span>
                        {r.symbol} <span className="mut" style={{ fontSize: 12 }}>{r.chain}</span>
                        <span className="m mut" style={{ display: "block", fontSize: 12 }}>{r.qty.toPrecision(4)}</span>
                      </span>
                      <span style={{ textAlign: "right" }}>
                        <span className="m" style={{ display: "block" }}>${r.valueUsd.toFixed(2)}</span>
                        {r.pnlUsd !== null && <span className={`m ${pnlClass(r.pnlUsd)}`} style={{ fontSize: 12 }}>{signedUsd(r.pnlUsd)} ({pct(r.pnlPercent!)})</span>}
                      </span>
                    </div>
                  ))}
                  {!rows.length && <p className="mut" style={{ margin: 0, paddingTop: 12, borderTop: "1px solid var(--line)" }}>No assets yet.</p>}
                </section>
                <OpenOrders title="Pending orders" />
                <section>
                  <h2 style={{ fontSize: 18, paddingBottom: 12 }}>Trade history</h2>
                  <OrderHistory />
                </section>
              </div>
              <aside className="side" style={{ gap: 12 }}>
                <section className="panel">
                  <h2 style={{ fontSize: 16, marginBottom: 10 }}>Add funds</h2>
                  <WalletAddress address={address} />
                </section>
                <section className="panel" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <h2 style={{ fontSize: 16 }}>Copy trading</h2>
                  <p className="mut" style={{ margin: 0 }}>See who you copy, change your settings, and check every copied trade.</p>
                  <Link href="/copying" className="btn">Open copy trading</Link>
                </section>
              </aside>
            </div>
          </>
        )}
      </main>
    </>
  );
}
