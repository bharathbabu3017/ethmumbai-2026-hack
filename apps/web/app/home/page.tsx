import { leaderboard, listTrades, listUserCopySettings } from "@flashmob/db";
import Link from "next/link";
import { CopyDiagram } from "@/components/copy-diagram";
import { GettingStarted } from "@/components/getting-started";
import { Nav } from "@/components/nav";
import { SellPrompts } from "@/components/sell-prompts";
import { StatusStrip } from "@/components/status-strip";
import { TraderCard, TraderTable, type DiscoverTrader } from "@/components/trader-card";
import { db } from "@/lib/db";
import { tradeSize } from "@/lib/format";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// Cards read better while there are few traders. After that, a ranked table does.
const TABLE_FROM = 6;
const TOP_TOKENS = 5;

export default async function Home() {
  const [board, feed, session] = await Promise.all([leaderboard(db()), listTrades(db(), 300), getSession()]);
  const settings = session ? await listUserCopySettings(db(), session.userId) : [];
  const copying = new Set(settings.filter((s) => s.enabled).map((s) => s.traderId));
  const isTrader = board.some((t) => t.userId === session?.userId);

  const traders: DiscoverTrader[] = board.map((t) => {
    const theirs = feed.filter((r) => r.trader.id === t.id).map((r) => r.order);
    const filled = theirs.filter((o) => o.filledQty > 0);
    const curve = filled.filter((o) => o.soldCostUsd > 0).reverse().reduce<number[]>((sum, o) => [...sum, (sum.at(-1) ?? 0) + o.realizedUsd], []);
    const recent = filled.slice(0, 2).map((o) => ({ id: o.id, text: `${o.side === "sell" ? "Sold" : "Bought"} ${o.tokenSymbol} ${tradeSize(o)}`, at: o.placedAt }));
    const viewer = t.userId === session?.userId ? "you" as const : copying.has(t.id) ? "copying" as const : null;
    return { ...t, curve, recent, viewer };
  });

  const bought = new Map<string, { symbol: string; address: string; buys: number; usd: number }>();
  for (const { order: o } of feed) {
    if (o.side !== "buy" || !o.filledUsd || !o.tokenAddress) continue;
    const token = bought.get(o.tokenAddress) ?? { symbol: o.tokenSymbol ?? "", address: o.tokenAddress, buys: 0, usd: 0 };
    bought.set(o.tokenAddress, { ...token, buys: token.buys + 1, usd: token.usd + o.filledUsd });
  }
  const tokens = [...bought.values()].sort((a, b) => b.usd - a.usd).slice(0, TOP_TOKENS);

  return (
    <>
      <Nav />
      <main className="wrap wide" style={{ paddingTop: 28, paddingBottom: 56, display: "flex", flexDirection: "column", gap: 20 }}>
        <StatusStrip />
        <SellPrompts />
        <GettingStarted />
        <div>
          <h1 style={{ fontSize: 26 }}>Discover traders</h1>
          <p className="mut" style={{ margin: "4px 0 0" }}>Ranked from real fills. Pick one and your wallet can copy their trades.</p>
        </div>

        {traders.length === 0 ? (
          <div className="panel row" style={{ gap: 24 }}>
            <div style={{ flex: "1 1 220px" }}>
              <h2 style={{ fontSize: 18, marginBottom: 6 }}>No traders yet</h2>
              <p className="mut" style={{ margin: "0 0 14px" }}>Traders appear here with their real results once they create a profile. You could be the first.</p>
              <Link href="/become-a-trader" className="btn pri">Become a trader</Link>
            </div>
            <div style={{ flex: "1 1 220px", maxWidth: 300 }}><CopyDiagram /></div>
          </div>
        ) : traders.length >= TABLE_FROM ? <TraderTable traders={traders} /> : (
          <section aria-label="Traders" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 12 }}>
            {traders.map((t) => <TraderCard key={t.id} trader={t} />)}
            {!isTrader && (
              <article style={{ padding: 16, border: "1px dashed var(--line2)", borderRadius: 10, display: "flex", flexDirection: "column", gap: 10, justifyContent: "center" }}>
                <h2 style={{ fontSize: 18 }}>Trade in public</h2>
                <p className="mut" style={{ margin: 0 }}>Create a profile, and your real results appear here for others to copy.</p>
                <Link href="/become-a-trader" className="btn">Become a trader</Link>
              </article>
            )}
          </section>
        )}

        {tokens.length > 0 && (
          <section className="panel" aria-label="What traders are buying" style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
            <h2 style={{ fontSize: 15 }}>What traders are buying</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: "4px 32px" }}>
              {tokens.map((t) => (
                <Link key={t.address} href={`/trade?token=${t.address}`} className="between" style={{ alignItems: "center", minHeight: 44 }}>
                  <span style={{ fontWeight: 500 }}>{t.symbol}</span>
                  <span className="m mut" style={{ fontSize: 13 }}>{t.buys} {t.buys === 1 ? "buy" : "buys"}, ${t.usd.toFixed(2)}</span>
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>
    </>
  );
}
