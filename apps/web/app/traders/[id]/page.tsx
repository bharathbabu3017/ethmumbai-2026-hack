import { getAgentByTrader, isFollowing, leaderboard, listDecisions, listTraderTrades } from "@flashmob/db";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { AutoCopyCard } from "@/components/auto-copy";
import { Nav } from "@/components/nav";
import { ResultsCurve } from "@/components/results-curve";
import { SubscribeButton } from "@/components/subscribe-button";
import { TRADE_COLUMNS, TradeRow } from "@/components/trade-row";
import { When } from "@/components/when";
import { AGENT_STRATEGIES, signedUsd, type AgentSettings } from "@flashmob/flash";
import { db } from "@/lib/db";
import { basescan, pct, shortAddress } from "@/lib/format";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const DECISION_LABELS = { idle: "Waited", placed: "Placed", refused: "Refused", failed: "Failed" };

export default async function TraderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [trader] = await leaderboard(db(), [id]);
  if (!trader) notFound();
  const [trades, session] = await Promise.all([listTraderTrades(db(), trader.userId), getSession()]);
  const following = session ? await isFollowing(db(), session.userId, id) : false;
  const agent = await getAgentByTrader(db(), id);
  const decisions = agent ? await listDecisions(db(), agent.id) : [];
  const rules = agent?.settings as AgentSettings | undefined;

  const ret = trader.soldCostUsd > 0 ? (trader.realizedUsd / trader.soldCostUsd) * 100 : null;
  const stats: [string, string, string][] = [
    ["Return", ret === null ? "-" : pct(ret), ret === null ? "" : ret < 0 ? "dn" : "up"],
    ["Realized", signedUsd(trader.realizedUsd), trader.realizedUsd < 0 ? "dn" : trader.realizedUsd > 0 ? "up" : ""],
    ["Wins", trader.closed ? `${trader.wins}/${trader.closed}` : "-", ""],
    ["Trades", String(trader.trades), ""],
    ["Copiers", String(trader.copiers), ""],
  ];
  const sales = trades.filter((t) => t.soldCostUsd > 0).reverse();
  const curve = sales.reduce<number[]>((sum, t) => [...sum, (sum.at(-1) ?? 0) + t.realizedUsd], []);
  const mine = session?.userId === trader.userId;

  return (
    <>
      <Nav />
      <main className="wrap wide cols" style={{ paddingTop: 28, paddingBottom: 56, gap: 24 }}>
        <div className="main" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <section className="between" style={{ flexWrap: "wrap", alignItems: "center" }}>
          <div className="row" style={{ gap: 16, flexWrap: "nowrap", minWidth: 0 }}>
            <Avatar name={trader.displayName} size={64} />
            <div style={{ minWidth: 0 }}>
              <h1 className="row" style={{ fontSize: 28, gap: 8 }}>{trader.displayName}{agent && <span className="agent-badge">AI agent</span>}{agent?.status === "stopped" && <span className="mut" style={{ fontSize: 13, fontWeight: 400 }}>Stopped</span>}</h1>
              {trader.bio && <p className="mut" style={{ margin: "4px 0 0" }}>{trader.bio}</p>}
              {trader.walletAddress && <a className="m mut" style={{ display: "block", fontSize: 12, marginTop: 4 }} href={basescan(trader.walletAddress)} target="_blank" rel="noreferrer">{shortAddress(trader.walletAddress)} · View on Basescan</a>}
              {trader.xHandle && <a className="tag" href={`https://x.com/${encodeURIComponent(trader.xHandle)}`}>@{trader.xHandle} on X</a>}
            </div>
          </div>
          {mine ? <Link href="/become-a-trader" className="btn">Your dashboard</Link> : <SubscribeButton traderId={id} initial={following} />}
          </section>
          <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 20 }}>
            {stats.map(([label, value, tone]) => (
              <div key={label}>
                <div className="stat-label">{label}</div>
                <div className={`m ${tone}`} style={{ fontSize: 22, marginTop: 4 }}>{value}</div>
              </div>
            ))}
          </section>
          <section className="panel">
            <h2 style={{ fontSize: 15, marginBottom: 12 }}>Realized profit over time</h2>
            <ResultsCurve points={curve} />
          </section>
          {agent && (
            <section className="table">
              <div style={{ padding: "14px 16px", fontWeight: 600 }}>Decisions</div>
              {decisions.length === 0 ? <p className="mut" style={{ margin: 0, padding: 16, borderTop: "1px solid var(--line)" }}>Every check it makes appears here, including when it does nothing.</p> : decisions.map((d) => (
                <div key={d.id} className="tr" style={{ gridTemplateColumns: "130px minmax(0,1fr) 90px", borderTop: "1px solid var(--line)" }}>
                  <span className="mut" style={{ fontSize: 13 }}><When at={d.createdAt} /></span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontWeight: 500, textTransform: "capitalize" }}>{d.action.replace("_", " ")}{d.tokenSymbol ? ` ${d.tokenSymbol}` : ""}{d.amountUsd ? ` $${d.amountUsd}` : ""}</span>
                    <span className="mut" style={{ fontSize: 13 }}>{d.reason}{d.note ? ` (${d.note})` : ""}</span>
                  </span>
                  <span style={{ fontSize: 13, textAlign: "right", color: d.status === "placed" ? "var(--up)" : d.status === "idle" ? "var(--mut)" : "var(--orange)" }}>{DECISION_LABELS[d.status]}</span>
                </div>
              ))}
            </section>
          )}
          <section className="table">
            <div style={{ padding: "14px 16px", fontWeight: 600 }}>Trades</div>
            {trades.length === 0 ? <p className="mut" style={{ margin: 0, padding: 16, borderTop: "1px solid var(--line)" }}>No trades yet. Everything this trader places on Flashmob appears here.</p> : (
              <>
                <div className="tr head" style={{ gridTemplateColumns: TRADE_COLUMNS, minWidth: 720, borderTop: "1px solid var(--line)" }}><span>Side</span><span>Token</span><span>Type</span><span>Size</span><span>Price</span><span>Result</span><span>When</span><span /></div>
                {trades.map((order) => <TradeRow key={order.id} order={order} canCopy={!mine} canShare={mine} />)}
              </>
            )}
          </section>
        </div>
        <aside className="side" style={{ gap: 12 }}>
          {!mine && <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 12 }}><AutoCopyCard traderId={id} name={trader.displayName} /></div>}
          {rules && (
            <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <h2 style={{ fontSize: 16 }}>How it trades</h2>
              <p className="mut" style={{ margin: 0 }}>{AGENT_STRATEGIES[rules.strategy].about}{rules.style ? ` ${rules.style}` : ""}</p>
              <div className="m" style={{ fontSize: 13 }}>
                <div className="between"><span className="mut">Budget</span><span>${rules.budgetUsd}</span></div>
                <div className="between"><span className="mut">Max per trade</span><span>${rules.maxTradeUsd}</span></div>
                <div className="between"><span className="mut">Checks every</span><span>{rules.everyMinutes} min</span></div>
                <div className="between"><span className="mut">Orders</span><span>{AGENT_STRATEGIES[rules.strategy].orders}</span></div>
              </div>
            </div>
          )}
        </aside>
      </main>
    </>
  );
}
