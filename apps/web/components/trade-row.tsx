import { COPYABLE_TYPES } from "@flashmob/flash";
import { CopyButton } from "@/components/copy-button";
import { ago, pct, tradeSize, tradeStatus, usd } from "@/lib/format";

export const TRADE_COLUMNS = "56px 90px 80px 80px 100px 90px minmax(90px,1fr) 84px";

interface Props {
  order: {
    id: string; side: string | null; orderType: string | null; tokenSymbol: string | null; qty: string | null; status: string | null; placedAt: Date | null;
    limitPrice: number | null; filledQty: number; filledUsd: number; realizedUsd: number; soldCostUsd: number;
  };
  /** Shows a Copy button on trades that can be copied. */
  canCopy?: boolean;
}

export function TradeRow({ order: o, canCopy }: Props) {
  const status = tradeStatus(o.status, o.filledQty);
  const price = o.filledQty > 0 ? o.filledUsd / o.filledQty : o.limitPrice;
  const result = o.soldCostUsd > 0 ? (o.realizedUsd / o.soldCostUsd) * 100 : null;
  return (
    <div className="tr" style={{ gridTemplateColumns: TRADE_COLUMNS, minWidth: 720 }}>
      <span className={`badge ${o.side === "sell" ? "sell" : "buy"}`} style={{ justifyContent: "center" }}>{o.side}</span>
      <span style={{ fontWeight: 500 }}>{o.tokenSymbol}</span>
      <span className="mut" style={{ textTransform: "capitalize" }}>{o.orderType}</span>
      <span className="m">{tradeSize(o)}</span>
      <span className="m">{price ? usd(price) : "-"}</span>
      {result !== null ? <span className={`m ${result < 0 ? "dn" : "up"}`}>{pct(result)}</span> : <span style={{ fontSize: 13, color: status.color }}>{status.label}</span>}
      <span className="mut" style={{ fontSize: 13 }}>{o.placedAt ? ago(o.placedAt) : ""}</span>
      <span style={{ display: "flex", justifyContent: "flex-end" }}>
        {canCopy && o.side === "buy" && COPYABLE_TYPES.includes(o.orderType ?? "") && status.label !== "Cancelled" && <CopyButton orderId={o.id} />}
      </span>
    </div>
  );
}
