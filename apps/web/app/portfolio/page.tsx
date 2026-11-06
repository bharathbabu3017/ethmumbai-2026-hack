"use client";

import type { FlashBalancesResponse } from "@flashmob/flash";
import { useEffect, useState } from "react";
import { Nav } from "@/components/nav";
import { OpenOrders } from "@/components/open-orders";
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
            <section>
              {balances.map((b) => (
                <div key={b.chain + b.address + b.isNative} className="between" style={{ padding: "12px 0", borderTop: "1px solid var(--line)" }}>
                  <span>{b.symbol} <span className="mut" style={{ fontSize: 12 }}>{b.chain}</span></span>
                  <span className="m">${Number(b.notional).toFixed(2)}</span>
                </div>
              ))}
              {!balances.length && <p className="mut" style={{ margin: 0, paddingTop: 12, borderTop: "1px solid var(--line)" }}>No balances yet.</p>}
            </section>
            <OpenOrders />
          </>
        )}
      </main>
    </>
  );
}
