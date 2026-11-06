"use client";

import type { CopySettings } from "@flashmob/flash";
import Link from "next/link";
import { useState } from "react";
import { Avatar } from "@/components/avatar";
import { ensureSession, postJson, type Me } from "@/lib/account";
import { useWallet } from "@/lib/wallet";

const describe = (s: CopySettings) => (s.sizing === "fixed" ? `$${s.amountUsd} per trade` : `${s.percentOfBalance}% of balance, max $${s.maxPerTradeUsd}`) + `, $${s.dailyCapUsd} a day`;

export function AutoCopyList({ me, onChange }: { me?: Me; onChange(): void }) {
  const { getSigner } = useWallet();
  const [error, setError] = useState("");
  const rows = me?.autoCopies?.filter((r) => r.enabled) ?? [];
  if (!rows.length) return null;

  const toggle = async () => {
    setError("");
    try {
      await ensureSession(getSigner);
      await postJson("/api/copy-pause", { paused: !me?.copyPaused });
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    }
  };

  return (
    <section>
      <div className="between" style={{ paddingBottom: 12, alignItems: "center" }}>
        <h2 style={{ fontSize: 18 }}>Auto-copy {me?.copyPaused && <span className="dn" style={{ fontSize: 13 }}>paused</span>}</h2>
        <button className={`btn ${me?.copyPaused ? "pri" : "warn"}`} onClick={toggle}>{me?.copyPaused ? "Resume all" : "Pause all"}</button>
      </div>
      {error && <p role="alert" className="dn" style={{ margin: "0 0 10px" }}>{error}</p>}
      {rows.map((r) => (
        <Link key={r.traderId} href={`/traders/${r.traderId}`} className="between" style={{ padding: "10px 0", borderTop: "1px solid var(--line)", alignItems: "center" }}>
          <span className="row" style={{ gap: 10 }}><Avatar name={r.displayName} size={28} /> {r.displayName}</span>
          <span className="m mut" style={{ fontSize: 12 }}>{describe(r.settings)}</span>
        </Link>
      ))}
    </section>
  );
}
