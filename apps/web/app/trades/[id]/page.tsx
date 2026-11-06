import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyPanel } from "@/components/copy-panel";
import { Nav } from "@/components/nav";
import { PriceChart } from "@/components/price-chart";
import { entryPrice } from "@flashmob/flash";
import { loadCopyTrade } from "@/lib/copy-trade";
import { pct, tradeSize, tradeStatus, usd } from "@/lib/format";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function TradePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  const found = await loadCopyTrade(id, session?.userId);
  if (!found) notFound();
  const { order, trader, copiers, trade, copyable, myCopy, own } = found;
  const status = tradeStatus(order.status, order.filledQty);
  const entry = entryPrice(order);
  const result = order.soldCostUsd > 0 ? (order.realizedUsd / order.soldCostUsd) * 100 : null;

  const levels = [
    ["Size", tradeSize(order), ""],
    [order.filledQty > 0 ? "Filled at" : "Price", entry === null ? "Market" : usd(entry), ""],
    ["Stop loss", usd(order.stopPrice), "dn"],
    ["Take profit", usd(order.targetPrice), "up"],
    ["Copied by", String(copiers), ""],
  ];

  return (
    <>
      <Nav />
      <main className="wrap cols" style={{ paddingTop: 44, paddingBottom: 64 }}>
        <section className="main" style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <div>
            <span style={{ fontSize: 13, color: status.color }}>{status.label}{result !== null ? ` ${pct(result)}` : ""}</span>
            <h1 className="big" style={{ margin: "6px 0", textTransform: "capitalize" }}>{order.side} {order.tokenSymbol}</h1>
            <span className="mut"><Link href={`/traders/${trader.id}`}>{trader.displayName}</Link> · {order.orderType} order on {order.chain}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 20 }}>
            {levels.map(([label, value, cls]) => (
              <div key={label}>
                <div className="mut" style={{ fontSize: 12 }}>{label}</div>
                <div className={`m ${value === "-" ? "" : cls}`} style={{ fontSize: 20, marginTop: 4 }}>{value}</div>
              </div>
            ))}
          </div>
          <PriceChart
            token={order.tokenAddress!}
            levels={[
              { label: order.filledQty > 0 ? "Filled" : "Entry", price: entry, tone: "entry" },
              { label: "Stop", price: order.stopPrice, tone: "stop" },
              { label: "Target", price: order.targetPrice, tone: "target" },
            ]}
          />
        </section>
        <aside className="side">
          {myCopy ? (
            <p className="mut" style={{ margin: 0 }}>You copied this trade with ${myCopy.amountUsd}. <Link href="/portfolio" style={{ color: "var(--text)" }}>View my orders</Link></p>
          ) : own ? (
            <p className="mut" style={{ margin: 0 }}>This is your trade.</p>
          ) : copyable ? (
            <CopyPanel trade={trade} />
          ) : (
            <p className="mut" style={{ margin: 0 }}>This trade can&apos;t be copied.</p>
          )}
        </aside>
      </main>
    </>
  );
}
