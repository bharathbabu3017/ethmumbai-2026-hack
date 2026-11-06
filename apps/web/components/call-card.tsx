import Link from "next/link";
import { pct, STATUS, usd } from "@/lib/format";

interface Props {
  call: { tokenSymbol: string; chain: string; entryPrice: number | null; stopPrice: number; targetPrice: number; status: string; resultPct: number | null; note: string | null };
  trader?: { id: string; displayName: string };
}

export function CallCard({ call, trader }: Props) {
  const status = STATUS[call.status] ?? { label: call.status, color: "var(--mut)" };
  return (
    <article className="card" style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="between" style={{ alignItems: "center" }}>
        {trader ? <Link href={`/traders/${trader.id}`}><strong>{trader.displayName}</strong></Link> : <span />}
        <span className="tag" style={{ color: status.color }}>{status.label}{call.resultPct !== null ? ` ${pct(call.resultPct)}` : ""}</span>
      </div>
      <div className="h" style={{ fontSize: 18, fontWeight: 700 }}>Long {call.tokenSymbol} on {call.chain}</div>
      <div className="m row" style={{ fontSize: 12 }}>
        <span className="mut">Entry <span style={{ color: "var(--text)" }}>{call.entryPrice === null ? "Market" : usd(call.entryPrice)}</span></span>
        <span className="mut">Stop <span className="dn">{usd(call.stopPrice)}</span></span>
        <span className="mut">Target <span className="up">{usd(call.targetPrice)}</span></span>
      </div>
      {call.note && <p className="mut" style={{ margin: 0 }}>{call.note}</p>}
    </article>
  );
}
