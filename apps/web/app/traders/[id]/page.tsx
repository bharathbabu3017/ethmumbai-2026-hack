import { isFollowing, leaderboard, listTraderTrades } from "@flashmob/db";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { FollowButton } from "@/components/follow-button";
import { Nav } from "@/components/nav";
import { ResultsCurve } from "@/components/results-curve";
import { TradeRow } from "@/components/trade-row";
import { db } from "@/lib/db";
import { pct } from "@/lib/format";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function TraderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [trader] = await leaderboard(db(), [id]);
  if (!trader) notFound();
  const [trades, session] = await Promise.all([listTraderTrades(db(), trader.userId), getSession()]);
  const following = session ? await isFollowing(db(), session.userId, id) : false;

  const ret = trader.soldCostUsd > 0 ? (trader.realizedUsd / trader.soldCostUsd) * 100 : null;
  const stats = [
    ["Return on sold positions", ret === null ? "-" : pct(ret)],
    ["Win rate", trader.closed ? `${Math.round((trader.wins / trader.closed) * 100)}%` : "-"],
    ["Filled trades", String(trader.trades)],
    ["Followers", String(trader.followers)],
  ];
  const sales = trades.filter((t) => t.soldCostUsd > 0).reverse();
  const curve = sales.reduce<number[]>((sum, t) => [...sum, (sum.at(-1) ?? 0) + t.realizedUsd], []);
  const latestBuy = trades.find((t) => t.side === "buy" && (t.orderType === "market" || t.orderType === "limit"));

  return (
    <>
      <Nav />
      <main className="wrap cols" style={{ paddingTop: 40, paddingBottom: 64, gap: 40 }}>
        <div className="main" style={{ display: "flex", flexDirection: "column", gap: 32 }}>
          <section className="row" style={{ gap: 16, flexWrap: "nowrap" }}>
            <Avatar name={trader.displayName} size={64} />
            <div style={{ minWidth: 0 }}>
              <h1 style={{ fontSize: 28 }}>{trader.displayName}</h1>
              {trader.bio && <p className="mut" style={{ margin: "4px 0 0" }}>{trader.bio}</p>}
              {trader.xHandle && <a className="tag" href={`https://x.com/${encodeURIComponent(trader.xHandle)}`}>@{trader.xHandle} on X</a>}
            </div>
          </section>
          <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 20 }}>
            {stats.map(([label, value]) => (
              <div key={label}>
                <div className="stat-label">{label}</div>
                <div className="m" style={{ fontSize: 22, marginTop: 4 }}>{value}</div>
              </div>
            ))}
          </section>
          <section className="panel">
            <h2 style={{ fontSize: 15, marginBottom: 12 }}>Realized profit over time</h2>
            <ResultsCurve points={curve} />
          </section>
          <section>
            <h2 style={{ fontSize: 18, marginBottom: 14 }}>Trades</h2>
            {trades.length === 0 && <p className="mut" style={{ margin: 0, paddingTop: 14, borderTop: "1px solid var(--line)" }}>No trades yet. Everything this trader places on Flashmob will appear here.</p>}
            {trades.map((order) => <TradeRow key={order.id} order={order} />)}
          </section>
        </div>
        <aside className="side" style={{ gap: 12 }}>
          <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <h2 style={{ fontSize: 16 }}>Follow {trader.displayName}</h2>
            <p className="mut" style={{ margin: 0 }}>Get a Telegram alert every time they trade.</p>
            <FollowButton traderId={id} initial={following} />
          </div>
          <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <h2 style={{ fontSize: 16 }}>Copy their trades</h2>
            <p className="mut" style={{ margin: 0 }}>Open a trade and choose your amount, stop and target. You sign each copy from your wallet.</p>
            {latestBuy ? <Link href={`/trades/${latestBuy.id}`} className="btn pri">View latest buy</Link> : <span className="mut" style={{ fontSize: 13 }}>Nothing to copy yet.</span>}
            <p className="mut" style={{ margin: 0, fontSize: 13 }}>Auto-copy is coming soon.</p>
          </div>
        </aside>
      </main>
    </>
  );
}
