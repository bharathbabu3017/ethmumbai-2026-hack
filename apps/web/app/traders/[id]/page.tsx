import { isFollowing, leaderboard, listTraderCalls } from "@flashmob/db";
import { notFound } from "next/navigation";
import { CallCard } from "@/components/call-card";
import { FollowButton } from "@/components/follow-button";
import { Nav } from "@/components/nav";
import { db } from "@/lib/db";
import { pct } from "@/lib/format";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function TraderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [trader] = await leaderboard(db(), [id]);
  if (!trader) notFound();
  const [calls, session] = await Promise.all([listTraderCalls(db(), id), getSession()]);
  const following = session ? await isFollowing(db(), session.userId, id) : false;

  const stats = [
    ["Total return", trader.closedCalls ? pct(trader.totalReturn) : "-"],
    ["Win rate", trader.closedCalls ? `${Math.round((trader.wins / trader.closedCalls) * 100)}%` : "-"],
    ["Closed calls", String(trader.closedCalls)],
    ["All calls", String(trader.totalCalls)],
    ["Followers", String(trader.followers)],
  ];
  return (
    <>
      <Nav />
      <main className="wrap" style={{ paddingTop: 44, paddingBottom: 64, display: "flex", flexDirection: "column", gap: 36 }}>
        <section className="between" style={{ alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <h1 style={{ fontSize: 32 }}>{trader.displayName}</h1>
            {trader.bio && <p className="mut" style={{ margin: "4px 0 8px" }}>{trader.bio}</p>}
            {trader.xHandle && <a className="tag" href={`https://x.com/${encodeURIComponent(trader.xHandle)}`}>X: @{trader.xHandle}</a>}
          </div>
          <FollowButton traderId={id} initial={following} />
        </section>
        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 20 }}>
          {stats.map(([label, value]) => (
            <div key={label}>
              <div className="mut" style={{ fontSize: 12 }}>{label}</div>
              <div className="m" style={{ fontSize: 22, marginTop: 4 }}>{value}</div>
            </div>
          ))}
        </section>
        <section>
          <h2 style={{ fontSize: 18, marginBottom: 14 }}>Calls</h2>
          {calls.length === 0 && <p className="mut" style={{ margin: 0 }}>No calls yet.</p>}
          {calls.map((call) => <CallCard key={call.id} call={call} />)}
        </section>
      </main>
    </>
  );
}
