import { getTrade } from "@flashmob/db";
import { ImageResponse } from "next/og";
import { db } from "@/lib/db";
import { pct, usd } from "@/lib/format";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "A trade on Flashmob";

const DARK = "#0B0C0E";
const LIME = "#C4F250";

/** The picture shown when a trade is shared. A winning sale gets the bright card. */
export default async function TradeImage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await getTrade(db(), id).catch(() => undefined);
  const o = row?.order;
  const result = o && o.soldCostUsd > 0 ? (o.realizedUsd / o.soldCostUsd) * 100 : null;
  const won = result !== null && result > 0;
  const bg = won ? LIME : DARK;
  const fg = won ? DARK : "#EDEEF0";
  const soft = won ? "#3A4A12" : "#8B919A";
  const price = o && o.filledQty > 0 ? o.filledUsd / o.filledQty : o?.limitPrice ?? null;
  const headline = result !== null ? pct(result) : o?.filledUsd ? `$${o.filledUsd.toFixed(2)}` : `$${o?.qty ?? ""}`;
  const verb = o?.side === "sell" ? "Sold" : "Bought";
  const facts = [["Price", price ? usd(price) : "-"], ["Size", o?.filledUsd ? `$${o.filledUsd.toFixed(2)}` : "-"], ["Type", o?.orderType ?? "-"]];

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "52px 60px", background: bg, color: fg }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", fontSize: 32, fontWeight: 700 }}>Flashmob</div>
          <div style={{ display: "flex", fontSize: 24, color: soft }}>{row?.trader.displayName ?? ""}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 40, fontWeight: 600 }}>{verb} {o?.tokenSymbol ?? ""}</div>
          <div style={{ display: "flex", fontSize: 170, fontWeight: 700, letterSpacing: -6, lineHeight: 1.1, color: won ? DARK : result !== null ? "#FF9470" : LIME }}>{headline}</div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ display: "flex", gap: 56 }}>
            {facts.map(([label, value]) => (
              <div key={label} style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", fontSize: 20, color: soft }}>{label}</div>
                <div style={{ display: "flex", fontSize: 32, marginTop: 4, textTransform: "capitalize" }}>{value}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", fontSize: 22, fontWeight: 600 }}>Real fills on Base</div>
        </div>
      </div>
    ),
    size,
  );
}
