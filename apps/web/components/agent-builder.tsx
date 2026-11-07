"use client";

import { AGENT_CHECK_MINUTES, BASE_TOKENS, entryLabel, exitLabels, ruleLabel, type AgentPlan, type AgentSettings, type PlanCheck, type PlanMetric } from "@flashmob/flash";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Nav } from "@/components/nav";
import { TokenIcon } from "@/components/token-icon";
import { TokenSearch, type PickedToken } from "@/components/token-picker";
import { ensureSession, postJson } from "@/lib/account";
import { plainError } from "@/lib/format";
import { useWallet } from "@/lib/wallet";

const CHECK_LABELS: Record<number, string> = { 15: "15 min", 60: "1 hour", 240: "4 hours" };
const SMALL_TRADE_USD = 20;

const STARTERS = [
  ["Buy dips", "Buy when RSI is under 30 and there is no bad news. Spread the buy across 3 limit orders, 1% apart, with a 5% stop. Sell half at +8% and trail the rest by 4%."],
  ["Ride breakouts", "When volume is above normal, place a stop buy at the 7-day high and trail it by 5%. Never buy when volatility is over 3%."],
  ["Follow the mob", "When 3 or more Flashmob traders buy it within an hour, market buy with a 6% stop and a 12% target. Skip anything under $500k liquidity."],
  ["Avoid bad news", "Buy every day over a 2 hour TWAP. Skip the day if there is major negative news."],
] as const;

const SOURCES: Partial<Record<PlanMetric, string>> = { mobBuyers: "Flashmob", liquidity: "Market", change24h: "Market" };

const AVAILABLE = [["Indicators", "RSI, moving averages, volatility, highs and lows"], ["News", "Recent headlines on its tokens"], ["Flashmob trades", "What traders here are buying"], ["Orders", "Market, limit, ladders, stop and stop limit buys, TWAP, brackets, trailing buys and stops"]];

interface Preview {
  buying: boolean;
  checks: PlanCheck[];
  orders: { label: string; value: string }[];
  exits: string[];
  reason: string;
  sources: { title: string; url: string }[];
}

const Row = ({ left, right, tone }: { left: string; right?: string; tone?: string }) => (
  <div className="between plan-row"><span style={{ minWidth: 0 }}>{left}</span>{right && <span className={tone ?? "mut"} style={{ flex: "none", fontSize: 13 }}>{right}</span>}</div>
);

export interface EditableAgent {
  id: string;
  status: string;
  displayName: string;
  settings: AgentSettings;
}

/** A token it already trades. One from outside the usual list shows its address until it's looked up. */
const known = (address: string): PickedToken => BASE_TOKENS.find((t) => t.address.toLowerCase() === address.toLowerCase()) ?? { symbol: `${address.slice(0, 6)}…`, address, riskFlagged: false };

/** Builds a new agent, or changes an existing one when given it. */
export function AgentBuilder({ agent }: { agent?: EditableAgent }) {
  const { address, ready, login, getSigner } = useWallet();
  const router = useRouter();
  const saved = agent?.settings;
  const [name, setName] = useState(agent?.displayName ?? "");
  const [text, setText] = useState<string>(saved?.style ?? STARTERS[0][1]);
  const [tokens, setTokens] = useState<PickedToken[]>(saved ? saved.tokens.map(known) : [BASE_TOKENS[0]!]);
  const [budgetUsd, setBudget] = useState(String(saved?.budgetUsd ?? 50));
  const [maxTradeUsd, setMaxTrade] = useState(String(saved?.maxTradeUsd ?? 20));
  const [everyMinutes, setEvery] = useState(saved?.everyMinutes ?? 60);
  const [searching, setSearching] = useState(false);
  const [plan, setPlan] = useState<AgentPlan | undefined>(saved?.plan);
  const [changes, setChanges] = useState<string[]>([]);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview>();
  const [hideStrategy, setHide] = useState(false);
  const [busy, setBusy] = useState<"plan" | "preview" | "create" | "save">();
  const [error, setError] = useState("");

  const settings = { style: text, tokens: tokens.map((t) => t.address), budgetUsd, maxTradeUsd, everyMinutes, plan };
  const limit = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPreview(undefined); };
  const rewrite = (v: string) => { setText(v); setPlan(undefined); setPreview(undefined); setSuggestion(null); setError(""); };
  const toggle = (t: PickedToken) => limit(setTokens)(tokens.some((x) => x.address === t.address) ? tokens.filter((x) => x.address !== t.address) : [...tokens, t]);
  const choices = [...BASE_TOKENS, ...tokens.filter((t) => !BASE_TOKENS.some((b) => b.address === t.address))];
  const step = preview ? "Step 3 of 3: Try it" : plan ? "Step 2 of 3: Check the plan" : "Step 1 of 3: Describe it";

  const act = async (kind: "plan" | "preview" | "create" | "save", fn: () => Promise<void>) => {
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
  const makePlan = () => act("plan", async () => {
    const result = await postJson<{ plan: AgentPlan; changes: string[] } | { refused: string; suggestion: string | null }>("/api/agents/plan", { strategy: text });
    if ("refused" in result) {
      setError(result.refused);
      setSuggestion(result.suggestion);
      return;
    }
    setPlan(result.plan);
    setChanges(result.changes);
    setPreview(undefined);
  });
  const runPreview = () => act("preview", async () => setPreview(await postJson<Preview>("/api/agents/preview", settings)));
  const create = () => act("create", async () => {
    await postJson("/api/agents", { ...settings, name, hideStrategy });
    router.push("/agents");
  });

  const save = () => act("save", async () => {
    await postJson(`/api/agents/${agent!.id}`, { action: "edit", ...settings, name });
    router.push("/agents");
  });
  const saveButton = <button className="btn pri" disabled={!!busy || !name.trim()} onClick={save}>{busy === "save" ? <><span className="spin" />Saving</> : "Save changes"}</button>;

  const failure = error && <p role="alert" className="dn" style={{ margin: 0, fontSize: 13 }}>{error}</p>;

  return (
    <>
      <Nav />
      <main className="wrap wide" style={{ paddingTop: 28, paddingBottom: 56, display: "flex", flexDirection: "column", gap: 20 }}>
        <div className="between" style={{ alignItems: "flex-end", flexWrap: "wrap" }}>
          <div>
            <Link href="/agents" className="mut" style={{ fontSize: 13 }}>Back to your agents</Link>
            <h1 style={{ fontSize: 26, marginTop: 6 }}>{agent ? `Edit ${agent.displayName}` : "Build an agent"}</h1>
          </div>
          {!agent && <span className="mut" style={{ fontSize: 13 }}>{step}</span>}
        </div>
        {!ready ? <div className="sk" style={{ height: 320 }} /> : !address ? <div><button className="btn pri" onClick={login}>{agent ? "Connect to edit your agent" : "Connect to build an agent"}</button></div> : (
          <div className="cols" style={{ gap: 20 }}>
            <section className="panel" style={{ flex: "1 1 460px", minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>
              {agent && <div><label className="lab" htmlFor="name">Name</label><input id="name" className="inp" style={{ fontFamily: "inherit" }} maxLength={32} value={name} onChange={(e) => setName(e.target.value)} /></div>}
              <div>
                <label className="lab" htmlFor="strategy">What should it do?</label>
                <textarea id="strategy" className="inp" rows={5} maxLength={800} style={{ fontFamily: "inherit", padding: "10px 12px", lineHeight: 1.5 }} value={text} onChange={(e) => rewrite(e.target.value)} />
              </div>
              <div>
                <span className="lab">Or start from one</span>
                <div className="row" style={{ gap: 6 }}>{STARTERS.map(([label, starter]) => <button key={label} className={`asset ${text === starter ? "sel" : ""}`} onClick={() => rewrite(starter)}>{label}</button>)}</div>
              </div>
              <div>
                <span className="lab">Tokens it can trade</span>
                <div className="row" style={{ gap: 6 }}>
                  {choices.map((t) => <button key={t.address} className={`asset ${tokens.some((x) => x.address === t.address) ? "sel" : ""}`} onClick={() => toggle(t)}><TokenIcon token={t} size={18} />{t.symbol}</button>)}
                  <button className="asset" onClick={() => setSearching(true)}>More</button>
                </div>
              </div>
              <div className="row" style={{ flexWrap: "nowrap" }}>
                <div style={{ flex: "1 1 0", minWidth: 0 }}><label className="lab" htmlFor="budget">Budget (USD)</label><input id="budget" className="inp" inputMode="decimal" value={budgetUsd} onChange={(e) => limit(setBudget)(e.target.value)} /></div>
                <div style={{ flex: "1 1 0", minWidth: 0 }}><label className="lab" htmlFor="max">Max per trade (USD)</label><input id="max" className="inp" inputMode="decimal" value={maxTradeUsd} onChange={(e) => limit(setMaxTrade)(e.target.value)} /></div>
              </div>
              <div>
                <span className="lab">Check the market every</span>
                <div className="row" style={{ gap: 6 }}>{AGENT_CHECK_MINUTES.map((m) => <button key={m} className={`asset ${everyMinutes === m ? "sel" : ""}`} onClick={() => limit(setEvery)(m)}>{CHECK_LABELS[m]}</button>)}</div>
              </div>
              <p className="mut" style={{ margin: 0, fontSize: 13 }}>Your limits always win, whatever the strategy says.{Number(maxTradeUsd) < SMALL_TRADE_USD ? ` Trades under $${SMALL_TRADE_USD} lose more to costs.` : ""}</p>
              {!plan && <button className="btn pri" disabled={!!busy} onClick={makePlan}>{busy === "plan" ? <><span className="spin" />Writing the plan, about 30 seconds</> : "Turn this into a plan"}</button>}
              {!plan && failure}
              {!plan && suggestion && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
                  <p style={{ margin: 0, fontSize: 13 }}><span className="mut">It could do this instead:</span> {suggestion}</p>
                  <button className="btn" onClick={() => rewrite(suggestion)}>Use this</button>
                </div>
              )}
            </section>

            <aside style={{ flex: "1 1 520px", minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
              {!plan && (
                <section className="panel" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <h2 style={{ fontSize: 18, marginBottom: 6 }}>It can use</h2>
                  {AVAILABLE.map(([what, detail]) => <Row key={what} left={what!} right={detail} />)}
                </section>
              )}

              {plan && (
                <section className="panel" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div>
                    <h2 style={{ fontSize: 18 }}>Its plan</h2>
                    <p className="mut" style={{ margin: "4px 0 0" }}>{plan.summary}</p>
                  </div>
                  {(plan.rules.length > 0 || plan.judgment) && (
                    <div>
                      <p className="plan-head">Buys when all of these are true</p>
                      {plan.rules.map((rule) => <Row key={ruleLabel(rule)} left={ruleLabel(rule)} right={SOURCES[rule.metric] ?? "Indicator"} tone="agent-badge" />)}
                      {plan.judgment && <Row left={plan.judgment} right={plan.useNews ? "News" : "AI check"} tone="agent-badge" />}
                    </div>
                  )}
                  <div>
                    <p className="plan-head">Then</p>
                    <Row left={entryLabel(plan.entry)} />
                    {exitLabels(plan.exit).map((exit) => <Row key={exit} left={exit} />)}
                  </div>
                  {changes.length > 0 && (
                    <div style={{ padding: "10px 12px", border: "1px solid var(--orange)", borderRadius: 8 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Not exactly what you wrote</div>
                      <ul className="mut" style={{ margin: 0, paddingLeft: 18, fontSize: 13, display: "flex", flexDirection: "column", gap: 2 }}>{changes.map((c) => <li key={c}>{c}</li>)}</ul>
                    </div>
                  )}
                  {!preview && (
                    <div className="between" style={{ alignItems: "center", paddingTop: 12, borderTop: "1px solid var(--line)" }}>
                      <span className="mut" style={{ fontSize: 13 }}>Wrong? Edit your text to rewrite it.</span>
                      <span className="row" style={{ gap: 8 }}>
                        <button className={`btn ${agent ? "" : "pri"}`} disabled={!!busy} onClick={runPreview}>{busy === "preview" ? <><span className="spin" />Checking</> : "Try it on live data"}</button>
                        {agent && saveButton}
                      </span>
                    </div>
                  )}
                  {agent && !preview && <p className="mut" style={{ margin: 0, fontSize: 13 }}>Changes apply from its next check. Orders and exits it already placed stay as they are.</p>}
                  {!preview && failure}
                </section>
              )}

              {preview && (
                <section className="panel" style={{ display: "flex", flexDirection: "column", gap: 14, borderColor: "var(--lime)" }}>
                  <h2 style={{ fontSize: 18 }}>If it ran now</h2>
                  <div>
                    <p className="plan-head">What it checked</p>
                    {preview.checks.length === 0 ? <Row left="Nothing to check" /> : preview.checks.map((c) => <Row key={c.label} left={c.label} right={c.value} tone={c.pass ? "up" : "dn"} />)}
                  </div>
                  <div>
                    <p className="plan-head">{preview.buying ? "It would place" : "It would do nothing. When the rules pass, it places"}</p>
                    {preview.orders.map((o, i) => <Row key={i} left={o.label} right={o.value} />)}
                    {preview.exits.map((exit) => <Row key={exit} left={`After it fills: ${exit}`} />)}
                  </div>
                  <p style={{ margin: 0 }}><span className="mut">Why:</span> {preview.reason}</p>
                  {preview.sources.length > 0 && <p className="mut" style={{ margin: 0, fontSize: 13 }}>Sources: {preview.sources.map((s, i) => <span key={s.url}>{i > 0 && ", "}<a href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a></span>)}</p>}
                  <p className="mut" style={{ margin: 0, fontSize: 13 }}>Nothing was placed. It can lose money.</p>
                  <div style={{ paddingTop: 12, borderTop: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: 12 }}>
                    {agent ? (
                      <>
                        <p className="mut" style={{ margin: 0, fontSize: 13 }}>Changes apply from its next check. Orders and exits it already placed stay as they are.</p>
                        <div className="row" style={{ flexWrap: "nowrap" }}>
                          {saveButton}
                          <button className="btn" disabled={!!busy} onClick={runPreview}>{busy === "preview" ? <><span className="spin" />Checking</> : "Run again"}</button>
                        </div>
                      </>
                    ) : (
                      <>
                    <div><label className="lab" htmlFor="name">Name</label><input id="name" className="inp" style={{ fontFamily: "inherit" }} maxLength={32} value={name} onChange={(e) => setName(e.target.value)} /></div>
                    <label className="row" style={{ flexWrap: "nowrap", gap: 10, minHeight: 32, cursor: "pointer" }}>
                      <input type="checkbox" checked={hideStrategy} onChange={(e) => setHide(e.target.checked)} style={{ width: 18, height: 18, accentColor: "var(--lime)" }} />
                      <span>Keep it private <span className="mut">(off Discover, with its strategy and reasons hidden. Its profile link still shows trades. You can change this later.)</span></span>
                    </label>
                    <div className="row" style={{ flexWrap: "nowrap" }}>
                      <button className="btn pri" style={{ flex: "1 1 auto" }} disabled={!!busy || !name.trim()} onClick={create}>{busy === "create" ? <><span className="spin" />Creating</> : name.trim() ? "Create agent" : "Name it to continue"}</button>
                      <button className="btn" disabled={!!busy} onClick={runPreview}>{busy === "preview" ? <><span className="spin" />Checking</> : "Run again"}</button>
                    </div>
                      </>
                    )}
                    {failure}
                  </div>
                </section>
              )}
            </aside>
          </div>
        )}
      </main>
      {searching && <TokenSearch onClose={() => setSearching(false)} onPick={(t) => { setSearching(false); if (!tokens.some((x) => x.address === t.address)) toggle(t); }} />}
    </>
  );
}
