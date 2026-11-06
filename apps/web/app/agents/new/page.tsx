"use client";

import { AGENT_CHECK_MINUTES, AGENT_STRATEGIES, BASE_TOKENS, type AgentDecision, type AgentStrategy } from "@flashmob/flash";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Nav } from "@/components/nav";
import { TokenIcon } from "@/components/token-icon";
import { TokenSearch, type PickedToken } from "@/components/token-picker";
import { ensureSession, postJson } from "@/lib/account";
import { plainError, usd } from "@/lib/format";
import { useWallet } from "@/lib/wallet";

const CHECK_LABELS: Record<number, string> = { 15: "15 min", 60: "1 hour", 240: "4 hours" };
const FIELDS: [keyof AgentDecision, string, boolean][] = [["amountUsd", "Amount", true], ["limitPrice", "Limit", true], ["stopPrice", "Stop loss", true], ["targetPrice", "Take profit", true], ["triggerPrice", "Triggers at", true], ["trailPercent", "Trail (%)", false], ["durationMinutes", "Over (minutes)", false], ["sellPercent", "Sell (%)", false]];

interface Preview {
  decision: AgentDecision;
  refused: string | null;
}

export default function NewAgent() {
  const { address, ready, login, getSigner } = useWallet();
  const router = useRouter();
  const [name, setName] = useState("");
  const [strategy, setStrategy] = useState<AgentStrategy>("dip");
  const [style, setStyle] = useState("");
  const [tokens, setTokens] = useState<PickedToken[]>([BASE_TOKENS[0]!]);
  const [budgetUsd, setBudget] = useState("25");
  const [maxTradeUsd, setMaxTrade] = useState("2");
  const [everyMinutes, setEvery] = useState(60);
  const [searching, setSearching] = useState(false);
  const [preview, setPreview] = useState<Preview>();
  const [busy, setBusy] = useState<"preview" | "create">();
  const [error, setError] = useState("");

  const settings = { strategy, style, tokens: tokens.map((t) => t.address), budgetUsd, maxTradeUsd, everyMinutes };
  const changed = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPreview(undefined); };
  const toggle = (t: PickedToken) => changed(setTokens)(tokens.some((x) => x.address === t.address) ? tokens.filter((x) => x.address !== t.address) : [...tokens, t]);
  const choices = [...BASE_TOKENS, ...tokens.filter((t) => !BASE_TOKENS.some((b) => b.address === t.address))];

  const act = async (kind: "preview" | "create", fn: () => Promise<void>) => {
    setBusy(kind);
    setError("");
    try {
      await ensureSession(getSigner);
      await fn();
    } catch (e) {
      setError(plainError(e));
    } finally {
      setBusy(undefined);
    }
  };
  const runPreview = () => act("preview", async () => setPreview(await postJson<Preview>("/api/agents/preview", settings)));
  const create = () => act("create", async () => {
    await postJson("/api/agents", { ...settings, name });
    router.push("/agents");
  });

  return (
    <>
      <Nav />
      <main className="wrap wide" style={{ paddingTop: 28, paddingBottom: 56, display: "flex", flexDirection: "column", gap: 20 }}>
        <div>
          <Link href="/agents" className="mut" style={{ fontSize: 13 }}>Back to your agents</Link>
          <h1 style={{ fontSize: 26, marginTop: 6 }}>Build an agent</h1>
          <p className="mut" style={{ margin: "4px 0 0" }}>It trades from its own wallet within your limits, in public, and anyone can copy it.</p>
        </div>
        {!ready ? <div className="sk" style={{ height: 320 }} /> : !address ? <div><button className="btn pri" onClick={login}>Connect to build an agent</button></div> : (
          <div className="cols" style={{ gap: 20 }}>
            <section className="panel main" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div><label className="lab" htmlFor="name">Name</label><input id="name" className="inp" style={{ fontFamily: "inherit" }} maxLength={32} value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div>
                <span className="lab">Strategy</span>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 8 }}>
                  {(Object.keys(AGENT_STRATEGIES) as AgentStrategy[]).map((k) => (
                    <button key={k} className={`pickcard ${strategy === k ? "sel" : ""}`} aria-pressed={strategy === k} onClick={() => changed(setStrategy)(k)}>
                      <span style={{ fontWeight: 600 }}>{AGENT_STRATEGIES[k].label}</span>
                      <span className="mut" style={{ fontSize: 13 }}>{AGENT_STRATEGIES[k].about}</span>
                      <span className="m up" style={{ fontSize: 12 }}>{AGENT_STRATEGIES[k].orders}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div><label className="lab" htmlFor="style">Its style (optional)</label><textarea id="style" className="inp" rows={2} maxLength={500} style={{ fontFamily: "inherit", padding: "10px 12px" }} placeholder="Only buy when it's down over 5% today, and take profit quickly." value={style} onChange={(e) => changed(setStyle)(e.target.value)} /></div>
              <div>
                <span className="lab">Tokens it can trade</span>
                <div className="row" style={{ gap: 6 }}>
                  {choices.map((t) => <button key={t.address} className={`asset ${tokens.some((x) => x.address === t.address) ? "sel" : ""}`} onClick={() => toggle(t)}><TokenIcon token={t} size={18} />{t.symbol}</button>)}
                  <button className="asset" onClick={() => setSearching(true)}>More</button>
                </div>
              </div>
              <div className="row" style={{ flexWrap: "nowrap" }}>
                <div style={{ flex: "1 1 0", minWidth: 0 }}><label className="lab" htmlFor="budget">Budget (USD)</label><input id="budget" className="inp" inputMode="decimal" value={budgetUsd} onChange={(e) => changed(setBudget)(e.target.value)} /></div>
                <div style={{ flex: "1 1 0", minWidth: 0 }}><label className="lab" htmlFor="max">Max per trade (USD)</label><input id="max" className="inp" inputMode="decimal" value={maxTradeUsd} onChange={(e) => changed(setMaxTrade)(e.target.value)} /></div>
              </div>
              <div>
                <span className="lab">Check the market every</span>
                <div className="row" style={{ gap: 6 }}>{AGENT_CHECK_MINUTES.map((m) => <button key={m} className={`asset ${everyMinutes === m ? "sel" : ""}`} onClick={() => changed(setEvery)(m)}>{CHECK_LABELS[m]}</button>)}</div>
              </div>
            </section>

            <aside className="side" style={{ gap: 12 }}>
              <section className="panel" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <h2 style={{ fontSize: 15 }}>What it will do</h2>
                <p style={{ margin: 0 }}>{AGENT_STRATEGIES[strategy].label} on {tokens.map((t) => t.symbol).join(", ") || "no tokens yet"}. Every {CHECK_LABELS[everyMinutes]} it looks at the market and either places an order of up to ${maxTradeUsd} or does nothing, using at most ${budgetUsd} in total.</p>
                <p className="mut" style={{ margin: 0, fontSize: 13 }}>Its trades and reasons are public. It can lose money.</p>
              </section>
              <section className="panel" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {!preview ? (
                  <>
                    <h2 style={{ fontSize: 15 }}>Try it first</h2>
                    <p className="mut" style={{ margin: 0 }}>See what it would do right now, on live prices. Nothing is placed. This takes about 20 seconds.</p>
                    <button className="btn pri" disabled={!!busy} onClick={runPreview}>{busy === "preview" ? <><span className="spin" />Thinking</> : "Run a preview"}</button>
                  </>
                ) : (
                  <>
                    <h2 style={{ fontSize: 15 }}>It would do this now</h2>
                    <div style={{ fontWeight: 600, textTransform: "capitalize" }}>{preview.decision.action.replace("_", " ")}{preview.decision.token ? ` ${preview.decision.token}` : ""}</div>
                    <div className="m" style={{ fontSize: 13 }}>
                      {FIELDS.map(([key, label, money]) => preview.decision[key] !== undefined && <div key={key} className="between"><span className="mut">{label}</span><span>{money ? usd(Number(preview.decision[key])) : String(preview.decision[key])}</span></div>)}
                    </div>
                    <p style={{ margin: 0 }}><span className="mut">Why:</span> {preview.decision.reason}</p>
                    {preview.refused && <p className="dn" style={{ margin: 0, fontSize: 13 }}>Our checks would refuse this: {preview.refused}</p>}
                    <button className="btn" disabled={!!busy} onClick={runPreview}>{busy === "preview" ? <><span className="spin" />Thinking</> : "Run again"}</button>
                    <button className="btn pri" disabled={!!busy || !name.trim()} onClick={create}>{busy === "create" ? <><span className="spin" />Creating</> : name.trim() ? "Create agent" : "Name it to continue"}</button>
                  </>
                )}
                {error && <p role="alert" className="dn" style={{ margin: 0, fontSize: 13 }}>{error}</p>}
              </section>
            </aside>
          </div>
        )}
      </main>
      {searching && <TokenSearch onClose={() => setSearching(false)} onPick={(t) => { setSearching(false); if (!tokens.some((x) => x.address === t.address)) toggle(t); }} />}
    </>
  );
}
