"use client";

import { holdings, signedUsd, type FlashBalancesResponse, type Held } from "@flashmob/flash";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AddFunds } from "@/components/add-funds";
import { Nav } from "@/components/nav";
import { OpenOrders } from "@/components/open-orders";
import { OrderHistory } from "@/components/orders-panel";
import { SellPrompts } from "@/components/sell-prompts";
import { flash } from "@/lib/flash";
import { pct } from "@/lib/format";
import { useLiveOrders } from "@/lib/order-stream";
import { useWallet } from "@/lib/wallet";

const TABS = ["Assets", "Open orders", "Trade history"] as const;
const COLUMNS = "minmax(150px,1fr) 150px 110px 170px 84px";
const pnlClass = (n: number) => (n < 0 ? "dn" : n > 0 ? "up" : "");

export default function Portfolio() {
  const { address, login } = useWallet();
  const [balances, setBalances] = useState<FlashBalancesResponse["balances"]>([]);
  const [paid, setPaid] = useState<{ positions: Held[]; realizedUsd: number }>({ positions: [], realizedUsd: 0 });
  const [tab, setTab] = useState<(typeof TABS)[number]>("Assets");
  const [open, setOpen] = useState(0);
  const [funds, setFunds] = useState(false);
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
      <main className="wrap wide" style={{ paddingTop: 28, paddingBottom: 56, display: "flex", flexDirection: "column", gap: 24 }}>
        {!address ? <div><button className="btn pri" onClick={login}>Connect to see your portfolio</button></div> : (
          <>
            <section className="between" style={{ flexWrap: "wrap", alignItems: "flex-end" }}>
              <div className="row" style={{ gap: "16px 40px", alignItems: "flex-end" }}>
                <div>
                  <div className="stat-label">Total value</div>
                  <h1 className="m" style={{ fontSize: 40, fontWeight: 500, marginTop: 4 }}>${totalUsd.toFixed(2)}</h1>
                </div>
                {stats.map(([label, value]) => (
                  <div key={label}>
                    <div className="stat-label">{label}</div>
                    <div className={`m ${pnlClass(value)}`} style={{ fontSize: 22, marginTop: 4 }}>{signedUsd(value)}</div>
                  </div>
                ))}
              </div>
              <button className="btn pri" onClick={() => setFunds(true)}>Add funds</button>
            </section>
            {error && <p role="alert" className="dn" style={{ margin: 0 }}>{error}</p>}
            <SellPrompts />

            <section className="table">
              <div role="tablist" className="row" style={{ gap: 20, padding: "10px 16px" }}>
                {TABS.map((t) => (
                  <button key={t} role="tab" aria-selected={t === tab} className={`tab ${t === tab ? "active" : ""}`} onClick={() => setTab(t)}>
                    {t}{t === "Open orders" ? ` (${open})` : ""}
                  </button>
                ))}
              </div>
              {tab === "Assets" && (
                rows.length === 0 ? <p className="mut" style={{ margin: 0, padding: 16, borderTop: "1px solid var(--line)" }}>Send USDC on Base to your wallet to start trading.</p> : (
                  <>
                    <div className="tr head" style={{ gridTemplateColumns: COLUMNS, minWidth: 680, borderTop: "1px solid var(--line)" }}><span>Asset</span><span>Amount</span><span>Value</span><span>Profit/loss</span><span /></div>
                    {rows.map((r) => (
                      <div key={r.key} className="tr" style={{ gridTemplateColumns: COLUMNS, minWidth: 680, borderTop: "1px solid var(--line)" }}>
                        <span><span style={{ fontWeight: 500 }}>{r.symbol}</span> <span className="mut" style={{ fontSize: 12, textTransform: "capitalize" }}>{r.chain}</span></span>
                        <span className="m">{r.qty.toPrecision(4)}</span>
                        <span className="m">${r.valueUsd.toFixed(2)}</span>
                        {r.pnlUsd === null ? <span className="mut">-</span> : <span className={`m ${pnlClass(r.pnlUsd)}`}>{signedUsd(r.pnlUsd)} ({pct(r.pnlPercent!)})</span>}
                        <span style={{ display: "flex", justifyContent: "flex-end" }}>
                          {r.pnlUsd !== null && <Link href={`/trade?token=${r.address}&symbol=${encodeURIComponent(r.symbol)}&side=sell`} className="btn">Sell</Link>}
                        </span>
                      </div>
                    ))}
                  </>
                )
              )}
              {/* Stays mounted so the open order count is right on every tab. */}
              <div hidden={tab !== "Open orders"} style={{ padding: "0 16px 8px" }}><OpenOrders onCount={setOpen} /></div>
              {tab === "Trade history" && <div style={{ padding: "0 16px 8px" }}><OrderHistory /></div>}
            </section>
          </>
        )}
      </main>
      {funds && address && <AddFunds address={address} onClose={() => setFunds(false)} />}
    </>
  );
}
