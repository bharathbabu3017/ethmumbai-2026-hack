"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Nav } from "@/components/nav";
import { ensureSession, postJson } from "@/lib/account";
import { When } from "@/components/when";
import { pct, plainError } from "@/lib/format";
import type { TraderDashboard } from "@/lib/trader-dashboard";
import { useWallet } from "@/lib/wallet";

type Dashboard = Pick<TraderDashboard, "trader" | "copies">;

const COLUMNS = "minmax(150px,1fr) 100px 110px 140px";

export function TraderProfile({ initial }: { initial?: Dashboard }) {
  const { address, ready, login, getSigner } = useWallet();
  const [data, setData] = useState<Dashboard | undefined>(initial);
  const [profile, setProfile] = useState({ displayName: "", bio: "", xHandle: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => fetch("/api/traders/me").then((r) => (r.ok ? r.json() : { trader: null })).then(setData).catch(() => {});
  useEffect(() => {
    if (address && !data) void load();
  }, [address, data]);

  const create = async () => {
    setBusy(true);
    setError("");
    try {
      await ensureSession(getSigner);
      await postJson("/api/traders", profile);
      await load();
    } catch (e) {
      setError(plainError(e));
    } finally {
      setBusy(false);
    }
  };

  const edit = (key: keyof typeof profile) => ({
    value: profile[key],
    onChange: (e: { target: { value: string } }) => setProfile({ ...profile, [key]: e.target.value }),
  });

  const t = data?.trader;
  const copies = data?.copies ?? [];
  const ret = t && t.soldCostUsd > 0 ? (t.realizedUsd / t.soldCostUsd) * 100 : null;
  const stats: [string, string, string][] = t ? [
    ["Copiers", String(t.copiers), ""],
    ["Subscribers", String(t.followers), ""],
    ["Copied volume", `$${copies.reduce((sum, c) => sum + c.amountUsd, 0).toFixed(2)}`, ""],
    ["Your return", ret === null ? "-" : pct(ret), ret === null ? "" : ret < 0 ? "dn" : "up"],
  ] : [];

  return (
    <>
      <Nav />
      {t ? (
        <main className="wrap wide" style={{ paddingTop: 28, paddingBottom: 56, display: "flex", flexDirection: "column", gap: 24 }}>
          <div className="between" style={{ flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <h1 style={{ fontSize: 26 }}>Your trader profile</h1>
              <p className="mut" style={{ margin: "4px 0 0" }}>Who&apos;s copying you, and how much is following your trades.</p>
            </div>
            <Link href={`/traders/${t.id}`} className="btn">View public profile</Link>
          </div>
          <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 16 }}>
            {stats.map(([label, value, tone]) => (
              <div key={label}>
                <div className="stat-label">{label}</div>
                <div className={`m ${tone}`} style={{ fontSize: 22, marginTop: 4 }}>{value}</div>
              </div>
            ))}
          </section>
          <section className="table">
            <div style={{ padding: "14px 16px", fontWeight: 600 }}>Copies of your trades</div>
            {copies.length === 0 ? <p className="mut" style={{ margin: 0, padding: 16, borderTop: "1px solid var(--line)" }}>When someone copies a trade of yours, it appears here.</p> : (
              <>
                <div className="tr head" style={{ gridTemplateColumns: COLUMNS, minWidth: 520, borderTop: "1px solid var(--line)" }}><span>Token</span><span>Amount</span><span>How</span><span>When</span></div>
                {copies.map((c) => (
                  <div key={c.id} className="tr" style={{ gridTemplateColumns: COLUMNS, minWidth: 520, borderTop: "1px solid var(--line)" }}>
                    <span style={{ fontWeight: 500 }}>{c.tokenSymbol}</span>
                    <span className="m">${c.amountUsd.toFixed(2)}</span>
                    <span className="mut">{c.auto ? "Auto-copy" : "By hand"}</span>
                    <span className="mut" style={{ fontSize: 13 }}><When at={c.createdAt} /></span>
                  </div>
                ))}
              </>
            )}
          </section>
        </main>
      ) : (
        <main className="wrap" style={{ maxWidth: 480, paddingTop: 44, paddingBottom: 64 }}>
          <h1 style={{ fontSize: 26, marginBottom: 6 }}>Become a trader</h1>
          <p className="mut" style={{ margin: "0 0 20px" }}>Build a public record and let others copy you.</p>
          {!ready ? <div className="sk" style={{ height: 320 }} /> : !address ? <button className="btn pri" onClick={login}>Connect a wallet</button> : !data ? <div className="sk" style={{ height: 320 }} /> : (
            <section className="panel" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div><label className="lab" htmlFor="name">Display name</label><input id="name" className="inp" {...edit("displayName")} /></div>
              <div><label className="lab" htmlFor="bio">What do you trade?</label><input id="bio" className="inp" {...edit("bio")} /></div>
              <div><label className="lab" htmlFor="x">X handle (optional)</label><input id="x" className="inp" {...edit("xHandle")} /></div>
              <div style={{ padding: 12, border: "1px solid var(--line)", borderRadius: 8 }}>
                <div style={{ fontWeight: 500 }}>From now on, everything you place here is public</div>
                <div className="mut" style={{ fontSize: 13 }}>Your orders, results and wallet address appear on your profile, and people can copy your trades.</div>
              </div>
              <button className="btn pri" disabled={busy} onClick={create}>Create profile</button>
              {error && <p role="alert" className="dn" style={{ margin: 0 }}>{error}</p>}
            </section>
          )}
        </main>
      )}
    </>
  );
}
