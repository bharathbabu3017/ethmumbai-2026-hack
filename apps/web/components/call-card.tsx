import Link from "next/link";
import { pct, STATUS, usd } from "@/lib/format";

interface Props {
  call: { tokenSymbol: string; chain: string; entryPrice: number | null; stopPrice: number; targetPrice: number; status: string; resultPct: number | null; note: string | null };
  trader?: { id: string; displayName: string };
}

export function CallCard({ call, trader }: Props) {
  const status = STATUS[call.status] ?? { label: call.status, color: "var(--mut)" };
  return (
    <article style={{ padding: "14px 0", borderTop: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: 4 }}>
      <div className="between">
        <span style={{ fontWeight: 500 }}>Long {call.tokenSymbol}</span>
        <span style={{ fontSize: 12, color: status.color }}>{status.label}{call.resultPct !== null ? ` ${pct(call.resultPct)}` : ""}</span>
      </div>
      {trader && <Link href={`/traders/${trader.id}`} className="mut" style={{ fontSize: 13 }}>{trader.displayName}</Link>}
      <div className="m mut" style={{ fontSize: 12 }}>
        {call.entryPrice === null ? "Market" : usd(call.entryPrice)} · stop {usd(call.stopPrice)} · target {usd(call.targetPrice)}
      </div>
      {call.note && <p className="mut" style={{ margin: "4px 0 0", fontSize: 13 }}>{call.note}</p>}
    </article>
  );
}
