import { countCopies, findWalletById, getPosition, getTrade, getUserCopy } from "@flashmob/db";
import { OPEN_STATUSES } from "@flashmob/flash";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyPanel } from "@/components/copy-panel";
import { Nav } from "@/components/nav";
import { PriceChart } from "@/components/price-chart";
import { COPYABLE_TYPES, entryPrice } from "@/lib/copy";
import { db } from "@/lib/db";
import { pct, tradeStatus, usd } from "@/lib/format";
import { serverFlash } from "@/lib/orders";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function TradePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await getTrade(db(), id);
  if (!row?.order.tokenAddress) notFound();
  const { order, trader } = row;
  const [copiers, session, held] = await Promise.all([countCopies(db(), id), getSession(), getPosition(db(), order.walletId, order.tokenAddress!)]);
  const myCopy = session ? await getUserCopy(db(), id, session.userId) : undefined;
  const status = tradeStatus(order.status, order.filledQty);
  const entry = entryPrice(order);
  const result = order.soldCostUsd > 0 ? (order.realizedUsd / order.soldCostUsd) * 100 : null;
  const traderStillHolds = (held?.qty ?? 0) > 0;
  const funder = (await findWalletById(db(), order.walletId))?.address ?? "";
  const copyable = order.side === "buy" && COPYABLE_TYPES.includes(order.orderType ?? "") && (order.filledQty > 0 ? traderStillHolds : OPEN_STATUSES.includes(order.status ?? ""));

  // What a copy needs beyond the stored fields, from the order as Flash last reported it.
  const raw = order.raw as { trigger?: { notionalPrice?: string; crossPrice?: string; triggerType: "upper" | "lower" } | null; trailingStop?: { trailPercent: string; activationPrice: string | null } } | null;
  const triggerPrice = raw?.trigger?.notionalPrice ?? raw?.trigger?.crossPrice;
  const expires = copyable && order.orderType === "twap" ? (await serverFlash().getOrder(id, funder).catch(() => undefined))?.order.expiresAt : undefined;
  const twapMinutesLeft = expires ? (Date.parse(expires) - Date.now()) / 60_000 : null;

  const levels = [
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
          ) : session?.userId === trader.userId ? (
            <p className="mut" style={{ margin: 0 }}>This is your trade.</p>
          ) : copyable ? (
            <CopyPanel
              trade={{
                id: order.id, tokenSymbol: order.tokenSymbol!, tokenAddress: order.tokenAddress!, side: order.side, status: order.status, orderType: order.orderType,
                limitPrice: order.limitPrice, stopPrice: order.stopPrice, targetPrice: order.targetPrice, filledQty: order.filledQty, filledUsd: order.filledUsd,
                trigger: triggerPrice && raw?.trigger ? { price: triggerPrice, direction: raw.trigger.triggerType } : null,
                trail: raw?.trailingStop ? { percent: raw.trailingStop.trailPercent, activationPrice: raw.trailingStop.activationPrice } : null,
                twapMinutesLeft,
              }}
            />
          ) : (
            <p className="mut" style={{ margin: 0 }}>This trade can&apos;t be copied.</p>
          )}
        </aside>
      </main>
    </>
  );
}
