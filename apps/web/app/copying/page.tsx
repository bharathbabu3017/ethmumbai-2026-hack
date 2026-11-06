"use client";

import type { CopySettings } from "@flashmob/flash";
import Link from "next/link";
import { useState } from "react";
import { AddFunds } from "@/components/add-funds";
import { AutoCopySetup, TONES } from "@/components/auto-copy";
import { Avatar } from "@/components/avatar";
import { Nav } from "@/components/nav";
import { SubscribeButton } from "@/components/subscribe-button";
import { ensureSession, postJson } from "@/lib/account";
import { useCached } from "@/lib/cached";
import { copyStatus } from "@/lib/copy-status";
import { plainError, tradeStatus } from "@/lib/format";
import { useLiveOrders } from "@/lib/order-stream";
import { useWallet } from "@/lib/wallet";

interface Entry {
  id: string;
  kind: "buy" | "sell" | "skip";
  sourceOrderId: string;
  tokenSymbol: string | null;
  trader: string;
  traderId: string;
  createdAt: string;
  amountUsd?: number;
  auto?: boolean;
  percent?: number;
  reason?: string;
  orderStatus?: string | null;
  filledUsd?: number | null;
  filledQty?: number | null;
}

interface Row {
  traderId: string;
  displayName: string;
  settings: CopySettings | null;
  alerts: boolean;
  spent: number;
}

interface Data {
  history: Entry[];
  traders: Row[];
  tradingWallet: string | null;
  usdc: number;
  eth: number;
  paused: boolean;
  telegramLinked: boolean;
  masterOn: boolean;
}

type Filter = "All" | "Copied" | "Skipped";

const TRADERS = "minmax(190px,1.4fr) 170px 130px 130px 44px 190px";
const HISTORY = "64px minmax(170px,1fr) minmax(190px,1.4fr) 80px 90px 130px";
const empty = { margin: 0, padding: 16 };
const when = (at: string) => new Date(at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function HistoryRow({ e }: { e: Entry }) {
  const skipped = e.kind === "skip";
  const status = skipped ? { label: "Skipped", color: "var(--orange)" }
    : e.orderStatus ? tradeStatus(e.orderStatus, e.filledQty ?? 0)
    : { label: "Placing", color: "var(--blue)" };
  const size = e.filledUsd ? e.filledUsd : e.amountUsd;
  const how = skipped ? capitalize(e.reason ?? "")
    : e.kind === "sell" ? `Sold ${Math.round(e.percent ?? 0)}% of your copy`
    : e.auto ? "Auto-copy" : "Copied by you";
  return (
    <div className="tr" style={{ gridTemplateColumns: HISTORY, minWidth: 820 }}>
      <span className={`badge ${skipped ? "" : e.kind}`} style={{ justifyContent: "center", background: skipped ? "var(--soft)" : undefined, color: skipped ? "var(--mut)" : undefined }}>{skipped ? "Skip" : e.kind}</span>
      <span>{e.tokenSymbol} <Link href={`/traders/${e.traderId}`} className="mut">from {e.trader}</Link></span>
      <span className="mut" style={{ fontSize: 13 }}>{how}</span>
      <span className="m">{size ? `$${size.toFixed(2)}` : "-"}</span>
      <span style={{ fontSize: 13, color: status.color }}>{status.label}</span>
      <span className="mut" style={{ fontSize: 13 }}>{when(e.createdAt)}</span>
    </div>
  );
}

export default function Copying() {
  const { address, login, getSigner } = useWallet();
  const { data, refresh: load } = useCached<Data>(address ? `copying:${address}` : null, () => fetch("/api/copying").then((r) => (r.ok ? r.json() : undefined)));
  const [filter, setFilter] = useState<Filter>("All");
  const [editing, setEditing] = useState<Row>();
  const [funds, setFunds] = useState(false);
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState("");

  useLiveOrders(load);

  const act = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError("");
    try {
      await ensureSession(getSigner);
      await fn();
      load();
    } catch (e) {
      setError(plainError(e));
    } finally {
      setBusy(undefined);
    }
  };
  const togglePause = () => act("pause", () => postJson("/api/copy-pause", { paused: !data?.paused }));
  const stop = (r: Row) => act(r.traderId, () => postJson(`/api/copy-settings/${r.traderId}`, { ...r.settings, enabled: false }));
  const linkTelegram = async () => {
    const { url } = await postJson<{ url: string }>("/api/telegram/link");
    window.open(url, "_blank");
  };

  const rows = (data?.traders ?? []).map((r) => ({
    ...r,
    state: r.settings && data ? copyStatus({ ...data, settings: r.settings, spent: r.spent, approved: !!data.tradingWallet }) : undefined,
  }));
  const copying = rows.filter((r) => r.settings);
  const problem = copying.find((r) => r.state?.tone === "warn");
  const done = data?.history.filter((e) => e.kind === "buy") ?? [];
  const history = data?.history.filter((e) => filter === "All" || (filter === "Skipped") === (e.kind === "skip")) ?? [];
  const stats = [
    ["Auto-copying", `${copying.length} ${copying.length === 1 ? "trader" : "traders"}`],
    ["Trades copied", String(done.length)],
    ["Total copied", `$${done.reduce((sum, e) => sum + (e.filledUsd ?? 0), 0).toFixed(2)}`],
    ["Wallet balance", `$${(data?.usdc ?? 0).toFixed(2)} USDC`],
  ];

  return (
    <>
      <Nav />
      <main className="wrap wide" style={{ paddingTop: 28, paddingBottom: 56, display: "flex", flexDirection: "column", gap: 24 }}>
        <div className="between" style={{ flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <h1 style={{ fontSize: 26 }}>Copying</h1>
            <p className="mut" style={{ margin: "4px 0 0" }}>Everyone you copy or get alerts from, in one list.</p>
          </div>
          {data && (
            <div className="row">
              {data.telegramLinked ? <span className="mut" style={{ fontSize: 13 }}>Telegram connected</span> : <button className="btn" onClick={linkTelegram}>Link Telegram</button>}
              {copying.length > 0 && <button className={`btn ${data.paused ? "pri" : "warn"}`} disabled={busy === "pause"} onClick={togglePause}>{data.paused ? "Resume all" : "Pause all"}</button>}
            </div>
          )}
        </div>
        {error && <p role="alert" className="dn" style={{ margin: 0 }}>{error}</p>}

        {!address ? <div><button className="btn pri" onClick={login}>Connect to get started</button></div> : !data ? <div className="sk" style={{ height: 240 }} /> : (
          <>
            {problem?.state && (
              <section className="between" style={{ flexWrap: "wrap", alignItems: "center", padding: "12px 16px", border: "1px solid var(--orange)", borderRadius: 10 }}>
                <span><span className="dn" style={{ fontWeight: 600 }}>{problem.state.label}.</span> {problem.state.detail}</span>
                {problem.state.fix === "funds" && data.tradingWallet && <button className="btn pri" onClick={() => setFunds(true)}>Add funds</button>}
                {problem.state.fix === "resume" && <button className="btn pri" onClick={togglePause}>Resume</button>}
                {(problem.state.fix === "edit" || problem.state.fix === "approve") && <button className="btn pri" onClick={() => setEditing(problem)}>{problem.state.fix === "edit" ? "Change limits" : "Approve wallet"}</button>}
              </section>
            )}

            <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 16 }}>
              {stats.map(([label, value]) => (
                <div key={label}>
                  <div className="stat-label">{label}</div>
                  <div className="m" style={{ fontSize: 22, marginTop: 4 }}>{value}</div>
                </div>
              ))}
            </section>

            <section className="table">
              {rows.length === 0 ? <p className="mut" style={empty}>You aren&apos;t copying anyone yet. <Link href="/home" style={{ color: "var(--text)" }}>Find a trader</Link> and your wallet follows their trades within your limits.</p> : (
                <>
                  <div className="tr head" style={{ gridTemplateColumns: TRADERS, minWidth: 940 }}><span>Trader</span><span>Status</span><span>Size</span><span>Used today</span><span>Alerts</span><span /></div>
                  {rows.map((r) => (
                    <div key={r.traderId} className="tr" style={{ gridTemplateColumns: TRADERS, minWidth: 940 }}>
                      <Link href={`/traders/${r.traderId}`} className="row" style={{ gap: 10, fontWeight: 500, flexWrap: "nowrap" }}><Avatar name={r.displayName} size={32} /> {r.displayName}</Link>
                      {r.state
                        ? <span className="row" style={{ gap: 8, color: TONES[r.state.tone], fontWeight: 500, fontSize: 13 }} title={r.state.detail}>{r.state.tone === "on" && <span className="pulse" aria-hidden="true" />}{r.state.label}</span>
                        : <span className="mut" style={{ fontSize: 13 }}>Alerts only</span>}
                      <span className="m">{r.settings ? (r.settings.sizing === "fixed" ? `$${r.settings.amountUsd} per trade` : `${r.settings.percentOfBalance}% of balance`) : "-"}</span>
                      <span className="m">{r.settings ? `$${r.spent.toFixed(2)} of $${r.settings.dailyCapUsd}` : "-"}</span>
                      <SubscribeButton traderId={r.traderId} initial={r.alerts} compact onChange={load} />
                      <span className="row" style={{ gap: 8, justifyContent: "flex-end", flexWrap: "nowrap" }}>
                        {r.settings
                          ? <><button className="btn" onClick={() => setEditing(r)}>Edit</button><button className="btn warn" disabled={busy === r.traderId} onClick={() => stop(r)}>Stop</button></>
                          : <button className="btn pri" onClick={() => setEditing(r)}>Start auto-copy</button>}
                      </span>
                    </div>
                  ))}
                </>
              )}
            </section>

            <section className="table">
              <div className="between" style={{ flexWrap: "wrap", alignItems: "center", padding: "8px 16px" }}>
                <h2 style={{ fontSize: 16 }}>History</h2>
                <div className="row" style={{ gap: 4 }}>
                  {(["All", "Copied", "Skipped"] as const).map((f) => <button key={f} className={`chip ${filter === f ? "on" : ""}`} onClick={() => setFilter(f)}>{f}</button>)}
                </div>
              </div>
              {history.length === 0 ? <p className="mut" style={{ ...empty, borderTop: "1px solid var(--line)" }}>Trades copied for you, and any that were skipped, appear here.</p> : history.map((e) => <div key={e.id} style={{ borderTop: "1px solid var(--line)" }}><HistoryRow e={e} /></div>)}
            </section>
          </>
        )}
      </main>
      {editing && <AutoCopySetup traderId={editing.traderId} name={editing.displayName} onClose={() => setEditing(undefined)} onSaved={load} />}
      {funds && data?.tradingWallet && <AddFunds address={data.tradingWallet} onClose={() => setFunds(false)} />}
    </>
  );
}
