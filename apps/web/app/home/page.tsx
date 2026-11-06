import { leaderboard, listTrades } from "@flashmob/db";
import Link from "next/link";
import { CopyDiagram } from "@/components/copy-diagram";
import { GettingStarted } from "@/components/getting-started";
import { MarketStrip } from "@/components/market-strip";
import { Nav } from "@/components/nav";
import { SellPrompts } from "@/components/sell-prompts";
import { TradeRow } from "@/components/trade-row";
import { TraderCard } from "@/components/trader-card";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [traders, trades] = await Promise.all([leaderboard(db()), listTrades(db())]);
  return (
    <>
      <Nav />
      <div style={{ borderBottom: "1px solid var(--line)" }}><div className="wrap"><MarketStrip /></div></div>
      <main className="wrap" style={{ paddingTop: 36, paddingBottom: 64, display: "flex", flexDirection: "column", gap: 40 }}>
        <div className="cols" style={{ gap: 32 }}>
          <section className="main">
            <h1 className="big" style={{ marginBottom: 8 }}>Find a trader to copy</h1>
            <p className="mut" style={{ margin: "0 0 24px", fontSize: 15, maxWidth: 560 }}>
              Traders&apos; records come from their real orders on Flashmob. Follow one for Telegram alerts, or copy their trades with your own stop and target.
            </p>
            {traders.length === 0 ? (
              <div className="panel row" style={{ gap: 24 }}>
                <div style={{ flex: "1 1 220px" }}>
                  <h2 style={{ fontSize: 18, marginBottom: 6 }}>No traders yet</h2>
                  <p className="mut" style={{ margin: "0 0 14px" }}>Traders appear here with their win rate and returns once they create a profile. You could be the first.</p>
                  <Link href="/become-a-trader" className="btn pri">Become a trader</Link>
                </div>
                <div style={{ flex: "1 1 220px", maxWidth: 300 }}><CopyDiagram /></div>
              </div>
            ) : (
              <div className="cards">
                {traders.map((t, i) => <TraderCard key={t.id} rank={i + 1} trader={t} />)}
              </div>
            )}
            {traders.length > 0 && <p className="mut" style={{ margin: "14px 0 0", fontSize: 13 }}>Want your trades here? <Link href="/become-a-trader" style={{ color: "var(--text)" }}>Become a trader</Link></p>}
          </section>
          <aside className="side" style={{ gap: 12 }}><SellPrompts /><GettingStarted /></aside>
        </div>

        <section>
          <h2 className="row" style={{ fontSize: 18, gap: 8, marginBottom: 14 }}><span className="pulse" aria-hidden="true" /> Latest trades</h2>
          {trades.length === 0 && <p className="mut" style={{ margin: 0, paddingTop: 14, borderTop: "1px solid var(--line)" }}>Every trade by a Flashmob trader appears here as it happens.</p>}
          {trades.map(({ order, trader }) => <TradeRow key={order.id} order={order} trader={trader} />)}
        </section>
      </main>
    </>
  );
}
