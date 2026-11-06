"use client";

import { AGENT_STRATEGIES, USDC_BASE, type AgentSettings } from "@flashmob/flash";
import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { Nav } from "@/components/nav";
import { WalletAddress } from "@/components/wallet-address";
import { useCached } from "@/lib/cached";
import { flash } from "@/lib/flash";
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

const COLUMNS = "minmax(200px,1.4fr) 150px 120px 130px minmax(200px,1fr)";
const LABELS = { funding: "Needs funds", running: "Running", paused: "Paused", stopped: "Stopped" };
const TONES = { funding: "var(--orange)", running: "var(--up)", paused: "var(--mut)", stopped: "var(--mut)" };

export default function Agents() {
  const { address, ready, login } = useWallet();
  const { data: agents } = useCached<Agent[]>(address ? `agents:${address}` : null, async () => {
    const res = await fetch("/api/agents");
    if (!res.ok) return undefined;
    const { agents: rows } = (await res.json()) as { agents: Omit<Agent, "usdc">[] };
    return Promise.all(rows.map(async (a) => {
      const { balances } = await flash.balances(a.address).catch(() => ({ balances: [] }));
      return { ...a, usdc: Number(balances.find((b) => b.address.toLowerCase() === USDC_BASE.toLowerCase())?.balance ?? 0) };
    }));
  });
  const waiting = agents?.find((a) => a.status === "funding");

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
            {waiting && (
              <section className="panel" style={{ maxWidth: 520, display: "flex", flexDirection: "column", gap: 10 }}>
                <h2 style={{ fontSize: 16 }}>{waiting.displayName} has its own wallet</h2>
                <p className="mut" style={{ margin: 0 }}>Agents can&apos;t trade yet, so please don&apos;t send funds here for now. Withdrawals are coming with the agent runner.</p>
                <WalletAddress address={waiting.address} />
              </section>
            )}
            <section className="table">
              <div className="tr head" style={{ gridTemplateColumns: COLUMNS, minWidth: 820 }}><span>Agent</span><span>Status</span><span>Wallet</span><span>Budget</span><span>Strategy</span></div>
              {agents.map((a) => (
                <div key={a.id} className="tr" style={{ gridTemplateColumns: COLUMNS, minWidth: 820, borderTop: "1px solid var(--line)" }}>
                  <Link href={`/traders/${a.traderId}`} className="row" style={{ gap: 10, fontWeight: 500, flexWrap: "nowrap" }}><Avatar name={a.displayName} size={32} /> {a.displayName}</Link>
                  <span style={{ fontSize: 13, fontWeight: 500, color: TONES[a.status] }}>{LABELS[a.status]}</span>
                  <span className="m">${a.usdc.toFixed(2)}</span>
                  <span className="m">${a.settings.budgetUsd}</span>
                  <span className="mut">{AGENT_STRATEGIES[a.settings.strategy].label}</span>
                </div>
              ))}
            </section>
          </>
        )}
      </main>
    </>
  );
}
