import Link from "next/link";
import { tradeSize, tradeStatus, usd } from "@/lib/format";

interface Props {
  order: {
    id: string; side: string | null; orderType: string | null; tokenSymbol: string | null; qty: string | null; status: string | null;
    limitPrice: number | null; stopPrice: number | null; targetPrice: number | null; filledQty: number; filledUsd: number; realizedUsd: number; soldCostUsd: number;
  };
  trader?: { id: string; displayName: string };
}

export function TradeRow({ order: o, trader }: Props) {
  const status = tradeStatus(o.status, o.filledQty);
  const price = o.filledQty > 0 ? o.filledUsd / o.filledQty : o.limitPrice;
  const result = o.soldCostUsd > 0 ? (o.realizedUsd / o.soldCostUsd) * 100 : null;
  const details = [o.orderType, price ? usd(price) : null, o.stopPrice ? `stop ${usd(o.stopPrice)}` : null, o.targetPrice ? `target ${usd(o.targetPrice)}` : null].filter(Boolean).join(" · ");
  return (
    <article style={{ padding: "14px 0", borderTop: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: 4 }}>
      <div className="between">
        <Link href={`/trades/${o.id}`} className="row" style={{ gap: 8, fontWeight: 500 }}><span className={`badge ${o.side === "sell" ? "sell" : "buy"}`}>{o.side}</span>{o.tokenSymbol}<span className="m">{tradeSize(o)}</span></Link>
        <span style={{ fontSize: 12, color: status.color }}>
          {result !== null ? <span className={result >= 0 ? "up" : "dn"}>{result >= 0 ? "+" : ""}{result.toFixed(1)}% </span> : null}{status.label}
        </span>
      </div>
      {trader && <Link href={`/traders/${trader.id}`} className="mut" style={{ fontSize: 13 }}>{trader.displayName}</Link>}
      <div className="m mut" style={{ fontSize: 12 }}>{details}</div>
    </article>
  );
}
