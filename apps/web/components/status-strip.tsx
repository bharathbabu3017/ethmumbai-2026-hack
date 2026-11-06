"use client";

import { holdings, signedUsd, type Held } from "@flashmob/flash";
import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchMe, type Me } from "@/lib/account";
import { flash } from "@/lib/flash";
import { useWallet } from "@/lib/wallet";

/** What's happening with your money, from any page that isn't about it. */
export function StatusStrip() {
  const { address } = useWallet();
  const [me, setMe] = useState<Me>();
  const [totals, setTotals] = useState<{ total: number; open: number }>();

  useEffect(() => {
    if (!address) return;
    fetchMe().then(setMe).catch(() => {});
    Promise.all([
      flash.balances(address),
      fetch("/api/portfolio").then((r) => (r.ok ? r.json() : { positions: [] as Held[], realizedUsd: 0 })),
    ]).then(([{ balances }, paid]) => {
      const h = holdings(balances, paid.positions, paid.realizedUsd);
      setTotals({ total: h.totalUsd, open: h.openPnlUsd });
    }).catch(() => {});
  }, [address]);

  const copying = me?.autoCopies?.filter((r) => r.enabled).length ?? 0;
  if (!address || !totals || !copying) return null;
  return (
    <section aria-label="Your status" className="panel between" style={{ flexWrap: "wrap", alignItems: "center", padding: "12px 16px" }}>
      <span className="row" style={{ gap: "12px 32px" }}>
        <span className="row" style={{ gap: 8 }}>{me?.copyPaused ? <span className="dn">Auto-copy paused</span> : <><span className="pulse" aria-hidden="true" />Auto-copy active on {copying} {copying === 1 ? "trader" : "traders"}</>}</span>
        <span className="mut">Portfolio <span className="m" style={{ color: "var(--text)" }}>${totals.total.toFixed(2)}</span></span>
        <span className="mut">Open profit/loss <span className={`m ${totals.open < 0 ? "dn" : "up"}`}>{signedUsd(totals.open)}</span></span>
      </span>
      <Link href="/copying" className="mut" style={{ fontSize: 13 }}>Manage copying</Link>
    </section>
  );
}
