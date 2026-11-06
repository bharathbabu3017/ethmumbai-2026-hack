"use client";

import { AGENT_CHECK_MINUTES, BASE_TOKENS, entryLabel, exitLabels, ruleLabel, type AgentPlan, type PlanCheck, type PlanMetric } from "@flashmob/flash";
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

const AVAILABLE = [["Indicators", "RSI, moving averages, volatility, highs and lows"], ["News", "Recent headlines on its tokens"], ["Flashmob trades", "What traders here are buying"], ["Orders", "Market, limit, ladders, stop buys, TWAP, brackets, trailing stops"]];

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

export default function NewAgent() {
  const { address, ready, login, getSigner } = useWallet();
  const router = useRouter();
  const [name, setName] = useState("");
  const [text, setText] = useState<string>(STARTERS[0][1]);
  const [tokens, setTokens] = useState<PickedToken[]>([BASE_TOKENS[0]!]);
  const [budgetUsd, setBudget] = useState("50");
  const [maxTradeUsd, setMaxTrade] = useState("20");
  const [everyMinutes, setEvery] = useState(60);
  const [searching, setSearching] = useState(false);
  const [plan, setPlan] = useState<AgentPlan>();
  const [leftOut, setLeftOut] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview>();
  const [hideStrategy, setHide] = useState(false);
  const [busy, setBusy] = useState<"plan" | "preview" | "create">();
  const [error, setError] = useState("");

  const settings = { style: text, tokens: tokens.map((t) => t.address), budgetUsd, maxTradeUsd, everyMinutes, plan };
  const limit = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPreview(undefined); };
  const rewrite = (v: string) => { setText(v); setPlan(undefined); setPreview(undefined); };
  const toggle = (t: PickedToken) => limit(setTokens)(tokens.some((x) => x.address === t.address) ? tokens.filter((x) => x.address !== t.address) : [...tokens, t]);
  const choices = [...BASE_TOKENS, ...tokens.filter((t) => !BASE_TOKENS.some((b) => b.address === t.address))];
  const step = preview ? "Step 3 of 3: Try it" : plan ? "Step 2 of 3: Check the plan" : "Step 1 of 3: Describe it";

  const act = async (kind: "plan" | "preview" | "create", fn: () => Promise<void>) => {
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
    const result = await postJson<{ plan: AgentPlan; leftOut: string | null }>("/api/agents/plan", { strategy: text });
    setPlan(result.plan);
    setLeftOut(result.leftOut);
    setPreview(undefined);
  });
  const runPreview = () => act("preview", async () => setPreview(await postJson<Preview>("/api/agents/preview", settings)));
  const create = () => act("create", async () => {
    await postJson("/api/agents", { ...settings, name, hideStrategy });
    router.push("/agents");
  });

  const failure = error && <p role="alert" className="dn" style={{ margin: 0, fontSize: 13 }}>{error}</p>;

  return (
    <>
      <Nav />
      <main className="wrap wide" style={{ paddingTop: 28, paddingBottom: 56, display: "flex", flexDirection: "column", gap: 20 }}>
        <div className="between" style={{ alignItems: "flex-end", flexWrap: "wrap" }}>
          <div>
            <Link href="/agents" className="mut" style={{ fontSize: 13 }}>Back to your agents</Link>
            <h1 style={{ fontSize: 26, marginTop: 6 }}>Build an agent</h1>
          </div>
          <span className="mut" style={{ fontSize: 13 }}>{step}</span>
        </div>
        {!ready ? <div className="sk" style={{ height: 320 }} /> : !address ? <div><button className="btn pri" onClick={login}>Connect to build an agent</button></div> : (
          <div className="cols" style={{ gap: 20 }}>
            <section className="panel" style={{ flex: "1 1 460px", minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>
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
                  {leftOut && <p className="dn" style={{ margin: 0, fontSize: 13 }}>{leftOut}</p>}
                  {!preview && (
                    <div className="between" style={{ alignItems: "center", paddingTop: 12, borderTop: "1px solid var(--line)" }}>
                      <span className="mut" style={{ fontSize: 13 }}>Wrong? Edit your text to rewrite it.</span>
                      <button className="btn pri" disabled={!!busy} onClick={runPreview}>{busy === "preview" ? <><span className="spin" />Checking</> : "Try it on live data"}</button>
                    </div>
                  )}
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
                    <div><label className="lab" htmlFor="name">Name</label><input id="name" className="inp" style={{ fontFamily: "inherit" }} maxLength={32} value={name} onChange={(e) => setName(e.target.value)} /></div>
                    <label className="row" style={{ flexWrap: "nowrap", gap: 10, minHeight: 32, cursor: "pointer" }}>
                      <input type="checkbox" checked={hideStrategy} onChange={(e) => setHide(e.target.checked)} style={{ width: 18, height: 18, accentColor: "var(--lime)" }} />
                      <span>Keep my strategy private <span className="mut">(trades and reasons stay public)</span></span>
                    </label>
                    <div className="row" style={{ flexWrap: "nowrap" }}>
                      <button className="btn pri" style={{ flex: "1 1 auto" }} disabled={!!busy || !name.trim()} onClick={create}>{busy === "create" ? <><span className="spin" />Creating</> : name.trim() ? "Create agent" : "Name it to continue"}</button>
                      <button className="btn" disabled={!!busy} onClick={runPreview}>{busy === "preview" ? <><span className="spin" />Checking</> : "Run again"}</button>
                    </div>
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
