"use client";

import { useState } from "react";
import { Drawer } from "@/components/drawer";
import { ensureSession, postJson } from "@/lib/account";
import { plainError } from "@/lib/format";
import { useWallet } from "@/lib/wallet";

const PRESETS = [["Any size", "", ""], ["$10+", "10", ""], ["$50+", "50", ""], ["$100+", "100", ""]] as const;

export const limitsLabel = (min: number | null, max: number | null) =>
  min !== null && max !== null ? `$${min}–$${max}` : min !== null ? `$${min}+` : max !== null ? `Up to $${max}` : "Any size";

/** Which trades from this trader send a Telegram alert, by size. */
export function AlertLimits({ traderId, name, minUsd, maxUsd, onClose, onSaved }: { traderId: string; name: string; minUsd: number | null; maxUsd: number | null; onClose(): void; onSaved(): void }) {
  const { getSigner } = useWallet();
  const [min, setMin] = useState(minUsd?.toString() ?? "");
  const [max, setMax] = useState(maxUsd?.toString() ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      await ensureSession(getSigner);
      await postJson("/api/follows/limits", { traderId, minUsd: min, maxUsd: max });
      onSaved();
      onClose();
    } catch (e) {
      setError(plainError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer title={`Alerts for ${name}`} onClose={onClose}>
      <p className="mut" style={{ margin: 0 }}>Only get a Telegram alert when their trade is this size. Your own copies and fills always reach you.</p>
      <div className="row" style={{ gap: 6 }}>
        {PRESETS.map(([label, lo, hi]) => <button key={label} className={`asset ${min === lo && max === hi ? "sel" : ""}`} onClick={() => { setMin(lo); setMax(hi); }}>{label}</button>)}
      </div>
      <div className="row" style={{ flexWrap: "nowrap" }}>
        <div style={{ flex: "1 1 0", minWidth: 0 }}><label className="lab" htmlFor="alert-min">At least (USD)</label><input id="alert-min" className="inp" inputMode="decimal" placeholder="No minimum" value={min} onChange={(e) => setMin(e.target.value)} /></div>
        <div style={{ flex: "1 1 0", minWidth: 0 }}><label className="lab" htmlFor="alert-max">At most (USD)</label><input id="alert-max" className="inp" inputMode="decimal" placeholder="No maximum" value={max} onChange={(e) => setMax(e.target.value)} /></div>
      </div>
      <button className="btn pri" disabled={busy} onClick={save}>{busy ? <><span className="spin" />Saving</> : "Save"}</button>
      {error && <p role="alert" className="dn" style={{ margin: 0, fontSize: 13 }}>{error}</p>}
    </Drawer>
  );
}
