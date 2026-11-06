import { leaderboard, listCalls } from "@flashmob/db";
import Link from "next/link";
import { CallCard } from "@/components/call-card";
import { Nav } from "@/components/nav";
import { db } from "@/lib/db";
import { pct } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [traders, calls] = await Promise.all([leaderboard(db()), listCalls(db())]);
  return (
    <>
      <Nav />
      <main className="wrap" style={{ paddingTop: 44, paddingBottom: 64 }}>
        <div className="cols">
          <section className="main">
            <h1 className="big" style={{ marginBottom: 20 }}>Traders</h1>
            {traders.length === 0 ? (
              <p className="mut" style={{ margin: 0, paddingTop: 14, borderTop: "1px solid var(--line)" }}>No traders yet. <Link href="/publish" style={{ color: "var(--text)" }}>Be the first</Link>.</p>
            ) : (
              <div className="scroll"><div style={{ minWidth: 520 }}>
                <div className="lead mut" style={{ fontSize: 12, borderTop: 0, paddingTop: 0 }}>
                  <span>#</span><span>Trader</span><span>Return</span><span>Win rate</span><span>Calls</span><span>Followers</span>
                </div>
                {traders.map((t, i) => (
                  <div key={t.id} className="lead">
                    <span className="m mut">{i + 1}</span>
                    <Link href={`/traders/${t.id}`} style={{ fontWeight: 500 }}>{t.displayName}</Link>
                    <span className={`m ${!t.closedCalls ? "mut" : t.totalReturn < 0 ? "dn" : "up"}`}>{t.closedCalls ? pct(t.totalReturn) : "-"}</span>
                    <span className="m">{t.closedCalls ? `${Math.round((t.wins / t.closedCalls) * 100)}%` : "-"}</span>
                    <span className="m">{t.totalCalls}</span>
                    <span className="m">{t.followers}</span>
                  </div>
                ))}
              </div></div>
            )}
          </section>
          <section className="side">
            <h2 className="big" style={{ marginBottom: 20 }}>Calls</h2>
            {calls.length === 0 && <p className="mut" style={{ margin: 0, paddingTop: 14, borderTop: "1px solid var(--line)" }}>No calls yet.</p>}
            {calls.map(({ call, trader }) => <CallCard key={call.id} call={call} trader={trader} />)}
          </section>
        </div>
      </main>
    </>
  );
}
