import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { Spark } from "@/components/spark";
import { TokenIcon } from "@/components/token-icon";
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
  recent: { id: string; text: string; at: Date | null; symbol: string; address: string | null }[];
  /** How this trader relates to whoever is looking. */
  viewer: "you" | "copying" | null;
  agent: boolean;
}

function TraderAction({ trader: t }: { trader: DiscoverTrader }) {
  if (t.viewer === "you") return <Link href="/become-a-trader" className="btn">Your dashboard</Link>;
  if (t.viewer === "copying") return <Link href={`/traders/${t.id}`} className="btn">Copying</Link>;
  return <Link href={`/traders/${t.id}`} className="btn pri">Copy</Link>;
}

const YouTag = () => <span className="tag" style={{ border: "1px solid var(--line2)", borderRadius: 5, padding: "1px 6px", flex: "none" }}>You</span>;

export const returnOf = (t: DiscoverTrader) => (t.soldCostUsd > 0 ? (t.realizedUsd / t.soldCostUsd) * 100 : null);

export function TraderCard({ trader: t }: { trader: DiscoverTrader }) {
  const ret = returnOf(t);
  return (
    <article className="panel" style={{ display: "flex", flexDirection: "column", gap: 12, padding: 16 }}>
      <Link href={`/traders/${t.id}`} className="row" style={{ gap: 10, flexWrap: "nowrap", minWidth: 0 }}>
        <Avatar name={t.displayName} size={40} />
        <span style={{ minWidth: 0 }}>
          <span className="row" style={{ gap: 6, flexWrap: "nowrap", fontWeight: 600 }}><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.displayName}</span>{t.viewer === "you" && <YouTag />}{t.agent && <span className="agent-badge">AI agent</span>}</span>
          {t.walletAddress && <span className="m mut" style={{ fontSize: 12 }}>{shortAddress(t.walletAddress)}</span>}
        </span>
      </Link>
      <div>
        <div className="stat-label">Return</div>
        {ret === null ? <div className="mut" style={{ fontSize: 15, lineHeight: "34px" }}>No results yet</div> : <div className={`m ${ret < 0 ? "dn" : "up"}`} style={{ fontSize: 28, lineHeight: 1.2 }}>{pct(ret)}</div>}
      </div>
      {t.curve.length > 0 && (
        <div>
          <Spark points={t.curve} height={56} />
          <div className="between mut" style={{ fontSize: 12, marginTop: 4 }}><span>Realized profit</span><span>{t.curve.length} {t.curve.length === 1 ? "sale" : "sales"}</span></div>
        </div>
      )}
      <div className="between" style={{ fontSize: 13 }}>
        <span><span className="mut">Wins</span> <span className="m">{t.closed ? `${t.wins}/${t.closed}` : "-"}</span></span>
        <span><span className="mut">Trades</span> <span className="m">{t.trades}</span></span>
        <span><span className="mut">Copiers</span> <span className="m">{t.copiers}</span></span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingTop: 12, borderTop: "1px solid var(--line)", flex: "1 1 auto" }}>
        {t.recent.map((r) => <div key={r.id} className="between" style={{ fontSize: 13, alignItems: "center" }}><span className="row" style={{ gap: 8, flexWrap: "nowrap" }}><TokenIcon token={r} size={18} />{r.text}</span><span className="mut" style={{ flex: "none" }}>{r.at ? ago(r.at) : ""}</span></div>)}
        {!t.recent.length && <span className="mut" style={{ fontSize: 13 }}>No trades yet.</span>}
      </div>
      <TraderAction trader={t} />
    </article>
  );
}

const COLUMNS = "36px minmax(200px,1.6fr) 100px 130px 80px 80px 80px minmax(170px,1fr) 136px";

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
            <Link href={`/traders/${t.id}`} className="row" style={{ gap: 10, flexWrap: "nowrap", fontWeight: 500 }}><Avatar name={t.displayName} size={32} /> {t.displayName}{t.viewer === "you" && <YouTag />}</Link>
            {ret === null ? <span className="mut">-</span> : <span className={`m ${ret < 0 ? "dn" : "up"}`} style={{ fontSize: 15 }}>{pct(ret)}</span>}
            <Spark points={t.curve} width={120} height={32} />
            <span className="m">{t.closed ? `${t.wins}/${t.closed}` : "-"}</span>
            <span className="m">{t.trades}</span>
            <span className="m">{t.copiers}</span>
            <span className="mut" style={{ fontSize: 13 }}>{t.recent[0]?.text ?? "-"}</span>
            <TraderAction trader={t} />
          </div>
        );
      })}
    </section>
  );
}
