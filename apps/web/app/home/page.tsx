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
      <main className="wrap" style={{ paddingTop: 28, paddingBottom: 48 }}>
        <div style={{ marginBottom: 22 }}>
          <h1 style={{ fontSize: 34 }}>Every record backed by real fills</h1>
          <p className="mut" style={{ margin: "6px 0 0" }}>Follow traders, get their calls in Telegram, and copy them with the stop and target attached.</p>
        </div>
        <div className="cols">
          <section className="card main" style={{ overflow: "hidden" }}>
            <h2 style={{ fontSize: 18, padding: "16px 18px" }}>Leaderboard</h2>
            {traders.length === 0 ? (
              <p className="mut" style={{ margin: 0, padding: "0 18px 18px" }}>No traders yet. <Link href="/publish" className="up">Be the first</Link>.</p>
            ) : (
              <div className="scroll"><div style={{ minWidth: 620 }}>
                <div className="lead mut" style={{ fontSize: 12, fontWeight: 600 }}>
                  <span>#</span><span>Trader</span><span>Return</span><span>Win rate</span><span>Closed</span><span>Open or total</span><span>Followers</span>
                </div>
                {traders.map((t, i) => (
                  <div key={t.id} className="lead">
                    <span className="m mut">{i + 1}</span>
                    <Link href={`/traders/${t.id}`}><strong>{t.displayName}</strong></Link>
                    <span className={`m ${t.totalReturn < 0 ? "dn" : "up"}`}>{t.closedCalls ? pct(t.totalReturn) : "-"}</span>
                    <span className="m">{t.closedCalls ? `${Math.round((t.wins / t.closedCalls) * 100)}%` : "-"}</span>
                    <span className="m">{t.closedCalls}</span>
                    <span className="m">{t.totalCalls}</span>
                    <span className="m">{t.followers}</span>
                  </div>
                ))}
              </div></div>
            )}
          </section>
          <section className="side">
            <h2 style={{ fontSize: 18, padding: "4px 2px" }}>Latest calls</h2>
            {calls.length === 0 && <p className="mut" style={{ margin: 0 }}>No calls yet.</p>}
            {calls.map(({ call, trader }) => <CallCard key={call.id} call={call} trader={trader} />)}
          </section>
        </div>
      </main>
    </>
  );
}
