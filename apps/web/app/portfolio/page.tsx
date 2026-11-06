"use client";

import type { FlashBalancesResponse } from "@flashmob/flash";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Nav } from "@/components/nav";
import { OpenOrders } from "@/components/open-orders";
import { SellPrompts } from "@/components/sell-prompts";
import { Avatar } from "@/components/avatar";
import { fetchMe, type Me } from "@/lib/account";
import { flash } from "@/lib/flash";
import { useWallet } from "@/lib/wallet";

export default function Portfolio() {
  const { address } = useWallet();
  const [balances, setBalances] = useState<FlashBalancesResponse["balances"]>([]);
  const [error, setError] = useState("");
  const [me, setMe] = useState<Me>();

  useEffect(() => {
    if (address) flash.balances(address).then((b) => setBalances(b.balances)).catch((e) => setError(e.message));
    fetchMe().then(setMe).catch(() => {});
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
            <section>
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
              <h2 style={{ fontSize: 18, paddingBottom: 12 }}>Trades you copied</h2>
              {me?.copies?.map((c) => (
                <Link key={c.id} href={`/trades/${c.sourceOrderId}`} className="between" style={{ padding: "12px 0", borderTop: "1px solid var(--line)" }}>
                  <span>{c.tokenSymbol} <span className="mut">from {c.trader}</span></span>
                  <span className="m">${c.amountUsd}</span>
                </Link>
              ))}
              {!me?.copies?.length && <p className="mut" style={{ margin: 0, paddingTop: 12, borderTop: "1px solid var(--line)" }}>Trades you copy appear here. <Link href="/home" style={{ color: "var(--text)" }}>Find a trader</Link></p>}
            </section>
            <section>
              <h2 style={{ fontSize: 18, paddingBottom: 12 }}>Following</h2>
              {me?.following?.map((t) => (
                <Link key={t.id} href={`/traders/${t.id}`} className="row" style={{ padding: "10px 0", borderTop: "1px solid var(--line)", gap: 10 }}>
                  <Avatar name={t.displayName} size={28} /> {t.displayName}
                </Link>
              ))}
              {!me?.following?.length && <p className="mut" style={{ margin: 0, paddingTop: 12, borderTop: "1px solid var(--line)" }}>You aren&apos;t following anyone yet.</p>}
            </section>
          </>
        )}
      </main>
    </>
  );
}
