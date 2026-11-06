import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { pct, shortAddress } from "@/lib/format";

interface Props {
  rank: number;
  trader: { id: string; displayName: string; bio: string | null; trades: number; closed: number; wins: number; realizedUsd: number; soldCostUsd: number; followers: number; walletAddress: string | null };
}

export function TraderCard({ rank, trader: t }: Props) {
  const ret = t.soldCostUsd > 0 ? (t.realizedUsd / t.soldCostUsd) * 100 : null;
  const stats = [
    ["Win rate", t.closed ? `${Math.round((t.wins / t.closed) * 100)}%` : "-"],
    ["Trades", String(t.trades)],
    ["Followers", String(t.followers)],
  ];
  return (
    <Link href={`/traders/${t.id}`} className="panel card-link">
      <div className="between" style={{ alignItems: "center" }}>
        <span className="row" style={{ gap: 10, flexWrap: "nowrap", minWidth: 0 }}>
          <Avatar name={t.displayName} />
          <span style={{ minWidth: 0 }}>
            <span style={{ display: "block", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.displayName}</span>
            {t.walletAddress && <span className="m mut" style={{ display: "block", fontSize: 12 }}>{shortAddress(t.walletAddress)}</span>}
          </span>
        </span>
        <span className="m mut" style={{ fontSize: 12 }}>#{rank}</span>
      </div>
      <div>
        <div className="stat-label">Return on sold positions</div>
        {ret === null
          ? <div className="mut" style={{ fontSize: 15, lineHeight: "34px" }}>No results yet</div>
          : <div className={`m ${ret < 0 ? "dn" : "up"}`} style={{ fontSize: 26 }}>{pct(ret)}</div>}
      </div>
      <div className="between">
        {stats.map(([label, value]) => (
          <div key={label}><div className="stat-label">{label}</div><div className="m">{value}</div></div>
        ))}
      </div>
    </Link>
  );
}
