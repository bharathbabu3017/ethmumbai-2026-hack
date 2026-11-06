import { isFollowing, leaderboard, listTraderTrades } from "@flashmob/db";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { CopySettingsPanel } from "@/components/copy-settings";
import { Nav } from "@/components/nav";
import { ResultsCurve } from "@/components/results-curve";
import { SubscribeButton } from "@/components/subscribe-button";
import { TradeRow } from "@/components/trade-row";
import { db } from "@/lib/db";
import { basescan, pct, shortAddress } from "@/lib/format";
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
    ["Subscribers", String(trader.followers)],
  ];
  const sales = trades.filter((t) => t.soldCostUsd > 0).reverse();
  const curve = sales.reduce<number[]>((sum, t) => [...sum, (sum.at(-1) ?? 0) + t.realizedUsd], []);

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
              {trader.walletAddress && <a className="m mut" style={{ display: "block", fontSize: 12, marginTop: 4 }} href={basescan(trader.walletAddress)} target="_blank" rel="noreferrer">{shortAddress(trader.walletAddress)} · View on Basescan</a>}
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
            {trades.map((order) => <TradeRow key={order.id} order={order} canCopy={session?.userId !== trader.userId} />)}
          </section>
        </div>
        <aside className="side" style={{ gap: 12 }}>
          {session?.userId !== trader.userId && <div className="panel"><CopySettingsPanel traderId={id} name={trader.displayName} /></div>}
          <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <h2 style={{ fontSize: 16 }}>Telegram alerts</h2>
            <p className="mut" style={{ margin: 0 }}>Get a message every time {trader.displayName} trades. Nothing is bought for you.</p>
            <SubscribeButton traderId={id} initial={following} />
          </div>
        </aside>
      </main>
    </>
  );
}
