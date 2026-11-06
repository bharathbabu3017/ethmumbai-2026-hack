"use client";

import { AGENT_STRATEGIES, USDC_BASE, type AgentSettings } from "@flashmob/flash";
import Link from "next/link";
import { useState } from "react";
import { Avatar } from "@/components/avatar";
import { Drawer } from "@/components/drawer";
import { FundAgent } from "@/components/fund-agent";
import { Nav } from "@/components/nav";
import { WithdrawAgent } from "@/components/withdraw-agent";
import { ensureSession, postJson } from "@/lib/account";
import { useCached } from "@/lib/cached";
import { flash } from "@/lib/flash";
import { plainError } from "@/lib/format";
import { useWallet } from "@/lib/wallet";

interface Agent {
  id: string;
  traderId: string;
  status: "funding" | "running" | "paused" | "stopped";
  settings: AgentSettings;
  displayName: string;
  address: string;
  usdc: number;
}

const COLUMNS = "minmax(190px,1.3fr) 120px 100px 90px minmax(130px,1fr) 390px";
const LABELS = { funding: "Needs funds", running: "Running", paused: "Paused", stopped: "Stopped" };
const TONES = { funding: "var(--orange)", running: "var(--up)", paused: "var(--mut)", stopped: "var(--mut)" };

export default function Agents() {
  const { address, ready, login, getSigner } = useWallet();
  const { data: agents, refresh } = useCached<Agent[]>(address ? `agents:${address}` : null, async () => {
    const res = await fetch("/api/agents");
    if (!res.ok) return undefined;
    const { agents: rows } = (await res.json()) as { agents: Omit<Agent, "usdc">[] };
    return Promise.all(rows.map(async (a) => {
      const { balances } = await flash.balances(a.address).catch(() => ({ balances: [] }));
      return { ...a, usdc: Number(balances.find((b) => b.address.toLowerCase() === USDC_BASE.toLowerCase())?.balance ?? 0) };
    }));
  });
  const [funding, setFunding] = useState<Agent>();
  const [withdrawing, setWithdrawing] = useState<Agent>();
  const [stopping, setStopping] = useState<Agent>();
  const [sell, setSell] = useState(true);
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState("");

  const act = async (id: string, body: object) => {
    setBusy(id);
    setError("");
    try {
      await ensureSession(getSigner);
      await postJson(`/api/agents/${id}`, body);
      setStopping(undefined);
      refresh();
    } catch (e) {
      setError(plainError(e));
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <>
      <Nav />
      <main className="wrap wide" style={{ paddingTop: 28, paddingBottom: 56, display: "flex", flexDirection: "column", gap: 24 }}>
        <div className="between" style={{ flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <h1 style={{ fontSize: 26 }}>Your agents</h1>
            <p className="mut" style={{ margin: "4px 0 0" }}>Each one trades its own wallet, within the limits you set.</p>
          </div>
          <Link href="/agents/new" className="btn pri">Build an agent</Link>
        </div>

        {!ready ? <div className="sk" style={{ height: 200 }} /> : !address ? <div><button className="btn pri" onClick={login}>Connect to see your agents</button></div> : !agents ? <div className="sk" style={{ height: 200 }} /> : !agents.length ? (
          <p className="mut" style={{ margin: 0 }}>You haven&apos;t built an agent yet. Pick a strategy, set limits, and see what it would do before you fund it.</p>
        ) : (
          <>
            <section className="table">
              <div className="tr head" style={{ gridTemplateColumns: COLUMNS, minWidth: 1130 }}><span>Agent</span><span>Status</span><span>Wallet</span><span>Budget</span><span>Strategy</span><span /></div>
              {agents.map((a) => (
                <div key={a.id} className="tr" style={{ gridTemplateColumns: COLUMNS, minWidth: 1130, borderTop: "1px solid var(--line)" }}>
                  <Link href={`/traders/${a.traderId}`} className="row" style={{ gap: 10, fontWeight: 500, flexWrap: "nowrap" }}><Avatar name={a.displayName} size={32} /> {a.displayName}</Link>
                  <span style={{ fontSize: 13, fontWeight: 500, color: TONES[a.status] }}>{LABELS[a.status]}</span>
                  <span className="m">${a.usdc.toFixed(2)}</span>
                  <span className="m">${a.settings.budgetUsd}</span>
                  <span className="mut">{AGENT_STRATEGIES[a.settings.strategy].label}</span>
                  <span className="row" style={{ gap: 8, justifyContent: "flex-end", flexWrap: "nowrap" }}>
                    {a.status === "running" && <button className="btn" disabled={busy === a.id} onClick={() => act(a.id, { action: "pause" })}>Pause</button>}
                    {a.status === "paused" && <button className="btn pri" disabled={busy === a.id} onClick={() => act(a.id, { action: "resume" })}>Resume</button>}
                    {a.status !== "stopped" && <button className="btn" onClick={() => setFunding(a)}>Add funds</button>}
                    {a.status !== "stopped" && <button className="btn" onClick={() => setWithdrawing(a)}>Withdraw</button>}
                    <button className="btn warn" onClick={() => setStopping(a)}>{a.status === "stopped" ? "Withdraw" : "Stop"}</button>
                  </span>
                </div>
              ))}
            </section>
          </>
        )}
        {error && <p role="alert" className="dn" style={{ margin: 0 }}>{error}</p>}
      </main>
      {funding && <FundAgent name={funding.displayName} agentAddress={funding.address} onClose={() => setFunding(undefined)} onSent={refresh} />}
      {withdrawing && <WithdrawAgent id={withdrawing.id} name={withdrawing.displayName} agentAddress={withdrawing.address} onClose={() => setWithdrawing(undefined)} onSent={refresh} />}
      {stopping && (
        <Drawer title={stopping.status === "stopped" ? `Withdraw from ${stopping.displayName}` : `Stop ${stopping.displayName}`} onClose={() => setStopping(undefined)}>
          <div>
            <span className="lab">What should happen to its tokens?</span>
            <div className="picks" style={{ gridTemplateColumns: "repeat(2,minmax(0,1fr))" }}>
              <button className={`btn ${sell ? "sel" : ""}`} onClick={() => setSell(true)}>Sell to USDC</button>
              <button className={`btn ${sell ? "" : "sel"}`} onClick={() => setSell(false)}>Keep the tokens</button>
            </div>
          </div>
          <p style={{ margin: 0 }}>{sell ? "We cancel its open orders, sell its tokens for USDC, and send everything to your wallet." : "We cancel its open orders and send everything to your wallet as it is."}</p>
          <p className="mut" style={{ margin: 0, fontSize: 13 }}>Funds go to {address?.slice(0, 6)}…{address?.slice(-4)}. A tiny amount of ETH stays behind to pay for the transfer. Its record stays public, and copiers keep their own positions. The wallet shown here updates once it's done, and you'll hear on Telegram if it's linked.</p>
          <button className="btn warn" disabled={busy === stopping.id} onClick={() => act(stopping.id, { action: "stop", sell })}>{busy === stopping.id ? <><span className="spin" />Working</> : stopping.status === "stopped" ? "Withdraw" : "Stop and withdraw"}</button>
        </Drawer>
      )}
    </>
  );
}
