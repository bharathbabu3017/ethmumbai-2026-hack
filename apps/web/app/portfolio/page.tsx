"use client";

import type { FlashBalancesResponse } from "@flashmob/flash";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Nav } from "@/components/nav";
import { OpenOrders } from "@/components/open-orders";
import { OrderHistory } from "@/components/orders-panel";
import { SellPrompts } from "@/components/sell-prompts";
import { WalletAddress } from "@/components/wallet-address";
import { flash } from "@/lib/flash";
import { useWallet } from "@/lib/wallet";

export default function Portfolio() {
  const { address } = useWallet();
  const [balances, setBalances] = useState<FlashBalancesResponse["balances"]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (address) flash.balances(address).then((b) => setBalances(b.balances)).catch((e) => setError(e.message));
  }, [address]);

  const total = balances.reduce((sum, b) => sum + Number(b.notional), 0);
  return (
    <>
      <Nav />
      <main className="wrap" style={{ paddingTop: 44, paddingBottom: 64, display: "flex", flexDirection: "column", gap: 32 }}>
        {!address ? (
          <p className="mut">Connect a wallet to see your balances and orders.</p>
        ) : (
          <>
            <div>
              <div className="mut" style={{ fontSize: 12 }}>Total value</div>
              <div className="m" style={{ fontSize: 36, marginTop: 4 }}>${total.toFixed(2)}</div>
            </div>
            {error && <p role="alert" className="dn" style={{ margin: 0 }}>{error}</p>}
            <SellPrompts />
            <div className="cols">
              <div className="main" style={{ display: "flex", flexDirection: "column", gap: 32 }}>
                <section>
                  <h2 style={{ fontSize: 18, paddingBottom: 12 }}>Balances</h2>
                  {balances.map((b) => (
                    <div key={b.chain + b.address + b.isNative} className="between" style={{ padding: "12px 0", borderTop: "1px solid var(--line)" }}>
                      <span>{b.symbol} <span className="mut" style={{ fontSize: 12 }}>{b.chain}</span></span>
                      <span className="m">${Number(b.notional).toFixed(2)}</span>
                    </div>
                  ))}
                  {!balances.length && <p className="mut" style={{ margin: 0, paddingTop: 12, borderTop: "1px solid var(--line)" }}>No balances yet.</p>}
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
