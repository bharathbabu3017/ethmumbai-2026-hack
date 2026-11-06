"use client";

import { holdings, signedUsd, type Held } from "@flashmob/flash";
import Link from "next/link";
import { useCached } from "@/lib/cached";
import { flash } from "@/lib/flash";
import { useWallet } from "@/lib/wallet";

/** What's happening with your money. The server says who's copying, so this is in place from the first paint. */
export function StatusStrip({ copying, paused }: { copying: number; paused: boolean }) {
  const { address } = useWallet();
  const { data: totals } = useCached<{ total: number; open: number }>(address ? `strip:${address}` : null, async () => {
    const [{ balances }, paid] = await Promise.all([
      flash.balances(address!),
      fetch("/api/portfolio").then((r) => (r.ok ? r.json() : { positions: [] as Held[], realizedUsd: 0 })),
    ]);
    const h = holdings(balances, paid.positions, paid.realizedUsd);
    return { total: h.totalUsd, open: h.openPnlUsd };
  });

  return (
    <section aria-label="Your status" className="panel between" style={{ flexWrap: "wrap", alignItems: "center", padding: "12px 16px" }}>
      <span className="row" style={{ gap: "12px 32px" }}>
        <span className="row" style={{ gap: 8 }}>{paused ? <span className="dn">Auto-copy paused</span> : <><span className="pulse" aria-hidden="true" />Auto-copy active on {copying} {copying === 1 ? "trader" : "traders"}</>}</span>
        <span className="mut">Portfolio <span className="m" style={{ color: "var(--text)" }}>{totals ? `$${totals.total.toFixed(2)}` : "-"}</span></span>
        <span className="mut">Open profit/loss {totals ? <span className={`m ${totals.open < 0 ? "dn" : "up"}`}>{signedUsd(totals.open)}</span> : <span className="m">-</span>}</span>
      </span>
      <Link href="/copying" className="mut" style={{ fontSize: 13 }}>Manage copy trading</Link>
    </section>
  );
}
