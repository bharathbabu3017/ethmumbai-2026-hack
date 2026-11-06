import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { Spark } from "@/components/spark";
import { ago, pct, shortAddress } from "@/lib/format";

export interface DiscoverTrader {
  id: string;
  displayName: string;
  walletAddress: string | null;
  trades: number;
  closed: number;
  wins: number;
  realizedUsd: number;
  soldCostUsd: number;
  copiers: number;
  curve: number[];
  recent: { id: string; text: string; at: Date | null }[];
}

export const returnOf = (t: DiscoverTrader) => (t.soldCostUsd > 0 ? (t.realizedUsd / t.soldCostUsd) * 100 : null);

export function TraderCard({ trader: t }: { trader: DiscoverTrader }) {
  const ret = returnOf(t);
  return (
    <article className="panel" style={{ display: "flex", flexDirection: "column", gap: 12, padding: 16 }}>
      <Link href={`/traders/${t.id}`} className="row" style={{ gap: 10, flexWrap: "nowrap", minWidth: 0 }}>
        <Avatar name={t.displayName} size={40} />
        <span style={{ minWidth: 0 }}>
          <span style={{ display: "block", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.displayName}</span>
          {t.walletAddress && <span className="m mut" style={{ fontSize: 12 }}>{shortAddress(t.walletAddress)}</span>}
        </span>
      </Link>
      <div className="between" style={{ alignItems: "flex-end" }}>
        <div>
          <div className="stat-label">Return</div>
          {ret === null ? <div className="mut" style={{ fontSize: 15, lineHeight: "34px" }}>No results yet</div> : <div className={`m ${ret < 0 ? "dn" : "up"}`} style={{ fontSize: 28, lineHeight: 1.2 }}>{pct(ret)}</div>}
        </div>
        <Spark points={t.curve} height={44} />
      </div>
      <div className="between" style={{ fontSize: 13 }}>
        <span><span className="mut">Wins</span> <span className="m">{t.closed ? `${t.wins}/${t.closed}` : "-"}</span></span>
        <span><span className="mut">Trades</span> <span className="m">{t.trades}</span></span>
        <span><span className="mut">Copiers</span> <span className="m">{t.copiers}</span></span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingTop: 12, borderTop: "1px solid var(--line)", flex: "1 1 auto" }}>
        {t.recent.map((r) => <div key={r.id} className="between" style={{ fontSize: 13 }}><span>{r.text}</span><span className="mut" style={{ flex: "none" }}>{r.at ? ago(r.at) : ""}</span></div>)}
        {!t.recent.length && <span className="mut" style={{ fontSize: 13 }}>No trades yet.</span>}
      </div>
      <Link href={`/traders/${t.id}`} className="btn pri">Copy</Link>
    </article>
  );
}

const COLUMNS = "36px minmax(200px,1.6fr) 100px 130px 80px 80px 80px minmax(170px,1fr) 96px";

/** The ranked view, once there are enough traders for one to be worth reading. */
export function TraderTable({ traders }: { traders: DiscoverTrader[] }) {
  return (
    <section className="table" aria-label="Leaderboard">
      <div className="tr head" style={{ gridTemplateColumns: COLUMNS, minWidth: 1060 }}><span>#</span><span>Trader</span><span>Return</span><span>Results</span><span>Wins</span><span>Trades</span><span>Copiers</span><span>Last trade</span><span /></div>
      {traders.map((t, i) => {
        const ret = returnOf(t);
        return (
          <div key={t.id} className="tr" style={{ gridTemplateColumns: COLUMNS, minWidth: 1060 }}>
            <span className="m mut">{i + 1}</span>
            <Link href={`/traders/${t.id}`} className="row" style={{ gap: 10, flexWrap: "nowrap", fontWeight: 500 }}><Avatar name={t.displayName} size={32} /> {t.displayName}</Link>
            {ret === null ? <span className="mut">-</span> : <span className={`m ${ret < 0 ? "dn" : "up"}`} style={{ fontSize: 15 }}>{pct(ret)}</span>}
            <Spark points={t.curve} height={32} />
            <span className="m">{t.closed ? `${t.wins}/${t.closed}` : "-"}</span>
            <span className="m">{t.trades}</span>
            <span className="m">{t.copiers}</span>
            <span className="mut" style={{ fontSize: 13 }}>{t.recent[0]?.text ?? "-"}</span>
            <Link href={`/traders/${t.id}`} className="btn pri">Copy</Link>
          </div>
        );
      })}
    </section>
  );
}
