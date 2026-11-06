import { COPYABLE_TYPES } from "@flashmob/flash";
import { CopyButton } from "@/components/copy-button";
import { ShareButton } from "@/components/share-button";
import { TokenIcon } from "@/components/token-icon";
import { When } from "@/components/when";
import { pct, tradeSize, tradeStatus, usd } from "@/lib/format";

export const TRADE_COLUMNS = "56px 110px 80px 80px 100px 90px minmax(130px,1fr) 84px";

interface Props {
  order: {
    id: string; side: string | null; orderType: string | null; tokenSymbol: string | null; tokenAddress: string | null; qty: string | null; status: string | null; placedAt: Date | null;
    limitPrice: number | null; filledQty: number; filledUsd: number; realizedUsd: number; soldCostUsd: number;
  };
  /** Shows a Copy button on trades that can be copied. */
  canCopy?: boolean;
  /** Shows a Share button, on a trader's own filled trades. */
  canShare?: boolean;
}

export function TradeRow({ order: o, canCopy, canShare }: Props) {
  const status = tradeStatus(o.status, o.filledQty);
  const price = o.filledQty > 0 ? o.filledUsd / o.filledQty : o.limitPrice;
  const result = o.soldCostUsd > 0 ? (o.realizedUsd / o.soldCostUsd) * 100 : null;
  const shareText = result !== null ? `Sold ${o.tokenSymbol} for ${pct(result)} on Flashmob.` : `${o.side === "sell" ? "Sold" : "Bought"} ${o.tokenSymbol}${price ? ` at ${usd(price)}` : ""} on Flashmob. Copy my trade:`;
  return (
    <div className="tr" style={{ gridTemplateColumns: TRADE_COLUMNS, minWidth: 720 }}>
      <span className={`badge ${o.side === "sell" ? "sell" : "buy"}`} style={{ justifyContent: "center" }}>{o.side}</span>
      <span className="row" style={{ gap: 8, flexWrap: "nowrap", fontWeight: 500 }}><TokenIcon token={{ symbol: o.tokenSymbol ?? "", address: o.tokenAddress }} size={20} />{o.tokenSymbol}</span>
      <span className="mut" style={{ textTransform: "capitalize" }}>{o.orderType}</span>
      <span className="m">{tradeSize(o)}</span>
      <span className="m">{price ? usd(price) : "-"}</span>
      {result !== null ? <span className={`m ${result < 0 ? "dn" : "up"}`}>{pct(result)}</span> : <span style={{ fontSize: 13, color: status.color }}>{status.label}</span>}
      <span className="mut" style={{ fontSize: 13 }}>{o.placedAt ? <When at={o.placedAt} /> : ""}</span>
      <span style={{ display: "flex", justifyContent: "flex-end" }}>
        {canCopy && o.side === "buy" && COPYABLE_TYPES.includes(o.orderType ?? "") && status.label !== "Cancelled" && <CopyButton orderId={o.id} />}
        {canShare && o.filledQty > 0 && <ShareButton orderId={o.id} text={shareText} />}
      </span>
    </div>
  );
}
