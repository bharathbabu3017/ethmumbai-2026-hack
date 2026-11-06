"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Avatar } from "@/components/avatar";
import { CopySettingsPanel } from "@/components/copy-settings";
import { Nav } from "@/components/nav";
import { SubscribeButton } from "@/components/subscribe-button";
import { ensureSession, fetchMe, postJson, type Me } from "@/lib/account";
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

const empty = { margin: 0, paddingTop: 12, borderTop: "1px solid var(--line)" };
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
    <Link href={`/trades/${e.sourceOrderId}`} style={{ display: "flex", flexDirection: "column", gap: 4, padding: "12px 0", borderTop: "1px solid var(--line)" }}>
      <span className="between">
        <span className="row" style={{ gap: 8 }}>
          {!skipped && <span className={`badge ${e.kind}`}>{e.kind}</span>}
          {e.tokenSymbol} <span className="mut">from {e.trader}</span>
        </span>
        <span style={{ fontSize: 12, color: status.color }}>{size ? <span className="m" style={{ color: "var(--text)" }}>${size.toFixed(2)} </span> : null}{status.label}</span>
      </span>
      <span className="between mut" style={{ fontSize: 12 }}><span>{how}</span><span style={{ flexShrink: 0 }}>{when(e.createdAt)}</span></span>
    </Link>
  );
}

export default function Copying() {
  const { address, login, getSigner } = useWallet();
  const [me, setMe] = useState<Me>();
  const [history, setHistory] = useState<Entry[]>();
  const [error, setError] = useState("");

  const loadMe = useCallback(() => fetchMe().then(setMe).catch(() => {}), []);
  const loadHistory = useCallback(() => {
    if (address) fetch("/api/copying").then((r) => (r.ok ? r.json() : { history: [] })).then((r) => setHistory(r.history)).catch(() => {});
  }, [address]);
  useEffect(() => {
    if (address) void loadMe();
    loadHistory();
  }, [address, loadMe, loadHistory]);
  useLiveOrders(loadHistory);

  const togglePause = async () => {
    setError("");
    try {
      await ensureSession(getSigner);
      await postJson("/api/copy-pause", { paused: !me?.copyPaused });
      window.location.reload();
    } catch (e) {
      setError(plainError(e));
    }
  };

  const copying = me?.autoCopies?.filter((r) => r.enabled) ?? [];
  const done = history?.filter((e) => e.kind === "buy") ?? [];
  const stats = [
    ["Auto-copying", String(copying.length)],
    ["Trades copied", String(done.length)],
    ["Total copied", `$${done.reduce((sum, e) => sum + (e.filledUsd ?? 0), 0).toFixed(2)}`],
    ["Skipped", String(history?.filter((e) => e.kind === "skip").length ?? 0)],
  ];

  return (
    <>
      <Nav />
      <main className="wrap" style={{ paddingTop: 44, paddingBottom: 64, display: "flex", flexDirection: "column", gap: 32 }}>
        <div className="between" style={{ alignItems: "flex-start" }}>
          <div>
            <h1 style={{ fontSize: 28 }}>Copy trading</h1>
            <p className="mut" style={{ margin: "4px 0 0" }}>The traders you copy, your alerts, and every trade copied for you.</p>
          </div>
          {copying.length > 0 && <button className={`btn ${me?.copyPaused ? "pri" : "warn"}`} onClick={togglePause}>{me?.copyPaused ? "Resume all" : "Pause all"}</button>}
        </div>
        {error && <p role="alert" className="dn" style={{ margin: 0 }}>{error}</p>}

        {!address ? (
          <div><button className="btn pri" onClick={login}>Connect to get started</button></div>
        ) : (
          <>
            <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 20 }}>
              {stats.map(([label, value]) => (
                <div key={label}>
                  <div className="stat-label">{label}</div>
                  <div className="m" style={{ fontSize: 22, marginTop: 4 }}>{value}</div>
                </div>
              ))}
            </section>

            <div className="cols">
              <div className="main" style={{ display: "flex", flexDirection: "column", gap: 32 }}>
                <section>
                  <h2 style={{ fontSize: 18, paddingBottom: 12 }}>Auto-copy</h2>
                  {!me ? <p className="mut" style={empty}>Loading…</p> : !copying.length ? (
                    <p className="mut" style={empty}>You aren&apos;t auto-copying anyone. <Link href="/home" style={{ color: "var(--text)" }}>Find a trader</Link> and tap Start auto-copy.</p>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 12, alignItems: "start" }}>
                      {copying.map((r) => (
                        <div key={r.traderId} className="panel" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                          <Link href={`/traders/${r.traderId}`} className="row" style={{ gap: 10, fontWeight: 500 }}><Avatar name={r.displayName} size={28} /> {r.displayName}</Link>
                          <CopySettingsPanel traderId={r.traderId} name={r.displayName} />
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section>
                  <h2 style={{ fontSize: 18, paddingBottom: 12 }}>History</h2>
                  {!history ? <p className="mut" style={empty}>Loading…</p>
                    : !history.length ? <p className="mut" style={empty}>Trades copied for you, and any that were skipped, appear here.</p>
                    : history.map((e) => <HistoryRow key={e.id} e={e} />)}
                </section>
              </div>

              <aside className="side" style={{ gap: 12 }}>
                <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <h2 style={{ fontSize: 16 }}>Telegram alerts</h2>
                  <p className="mut" style={{ margin: 0 }}>Traders you subscribe to message you when they trade. Nothing is bought for you.</p>
                  {me?.following?.map((t) => (
                    <div key={t.id} style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
                      <Link href={`/traders/${t.id}`} className="row" style={{ gap: 10 }}><Avatar name={t.displayName} size={28} /> {t.displayName}</Link>
                      <SubscribeButton traderId={t.id} initial />
                    </div>
                  ))}
                  {me && !me.following?.length && <Link href="/home" className="btn">Find a trader</Link>}
                </div>
              </aside>
            </div>
          </>
        )}
      </main>
    </>
  );
}
