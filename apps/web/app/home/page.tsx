import { leaderboard, listTrades } from "@flashmob/db";
import Link from "next/link";
import { Nav } from "@/components/nav";
import { TradeRow } from "@/components/trade-row";
import { db } from "@/lib/db";
import { pct } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [traders, trades] = await Promise.all([leaderboard(db()), listTrades(db())]);
  return (
    <>
      <Nav />
      <main className="wrap" style={{ paddingTop: 44, paddingBottom: 64 }}>
        <div className="cols">
          <section className="main">
            <div className="between" style={{ alignItems: "center", marginBottom: 20 }}>
              <h1 className="big">Traders</h1>
              <Link href="/become-a-trader" className="mut">Become a trader</Link>
            </div>
            {traders.length === 0 ? (
              <p className="mut" style={{ margin: 0, paddingTop: 14, borderTop: "1px solid var(--line)" }}>No traders yet.</p>
            ) : (
              <div className="scroll"><div style={{ minWidth: 520 }}>
                <div className="lead mut" style={{ fontSize: 12, borderTop: 0, paddingTop: 0 }}>
                  <span>#</span><span>Trader</span><span>Return</span><span>Win rate</span><span>Trades</span><span>Followers</span>
                </div>
                {traders.map((t, i) => {
                  const ret = t.soldCostUsd > 0 ? (t.realizedUsd / t.soldCostUsd) * 100 : null;
                  return (
                    <div key={t.id} className="lead">
                      <span className="m mut">{i + 1}</span>
                      <Link href={`/traders/${t.id}`} style={{ fontWeight: 500 }}>{t.displayName}</Link>
                      <span className={`m ${ret === null ? "mut" : ret < 0 ? "dn" : "up"}`}>{ret === null ? "-" : pct(ret)}</span>
                      <span className="m">{t.closed ? `${Math.round((t.wins / t.closed) * 100)}%` : "-"}</span>
                      <span className="m">{t.trades}</span>
                      <span className="m">{t.followers}</span>
                    </div>
                  );
                })}
              </div></div>
            )}
          </section>
          <section className="side">
            <h2 className="big" style={{ marginBottom: 20 }}>Latest trades</h2>
            {trades.length === 0 && <p className="mut" style={{ margin: 0, paddingTop: 14, borderTop: "1px solid var(--line)" }}>No trades yet.</p>}
            {trades.map(({ order, trader }) => <TradeRow key={order.id} order={order} trader={trader} />)}
          </section>
        </div>
      </main>
    </>
  );
}
