import { countCopies, getCall, getUserCopy } from "@flashmob/db";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyPanel } from "@/components/copy-panel";
import { Nav } from "@/components/nav";
import { db } from "@/lib/db";
import { pct, STATUS, usd } from "@/lib/format";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function CallPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const row = await getCall(db(), id);
  if (!row) notFound();
  const { call, trader } = row;
  const [copiers, session] = await Promise.all([countCopies(db(), id), getSession()]);
  const myCopy = session ? await getUserCopy(db(), id, session.userId) : undefined;
  const isOwn = session?.userId === trader.userId;
  const open = call.status === "waiting" || call.status === "live";
  const status = STATUS[call.status] ?? { label: call.status, color: "var(--mut)" };

  const levels = [
    ["Entry", call.entryPrice === null ? "Market" : usd(call.entryPrice), ""],
    ["Stop loss", usd(call.stopPrice), "dn"],
    ["Take profit", usd(call.targetPrice), "up"],
    ["Copied by", String(copiers), ""],
  ];

  return (
    <>
      <Nav />
      <main className="wrap cols" style={{ paddingTop: 44, paddingBottom: 64 }}>
        <section className="main" style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <div>
            <span style={{ fontSize: 13, color: status.color }}>{status.label}{call.resultPct !== null ? ` ${pct(call.resultPct)}` : ""}</span>
            <h1 className="big" style={{ margin: "6px 0" }}>Long {call.tokenSymbol} on {call.chain}</h1>
            <Link href={`/traders/${trader.id}`} className="mut">{trader.displayName}</Link>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 20 }}>
            {levels.map(([label, value, cls]) => (
              <div key={label}>
                <div className="mut" style={{ fontSize: 12 }}>{label}</div>
                <div className={`m ${cls}`} style={{ fontSize: 20, marginTop: 4 }}>{value}</div>
              </div>
            ))}
          </div>
          {call.note && <p className="mut" style={{ margin: 0, fontSize: 15 }}>{call.note}</p>}
        </section>
        <aside className="side">
          {myCopy ? (
            <p className="mut" style={{ margin: 0 }}>You copied this call with ${myCopy.amountUsd}. <Link href="/portfolio" style={{ color: "var(--text)" }}>View my orders</Link></p>
          ) : isOwn ? (
            <p className="mut" style={{ margin: 0 }}>This is your call.</p>
          ) : open ? (
            <CopyPanel call={call} />
          ) : (
            <p className="mut" style={{ margin: 0 }}>This call is closed, so it can no longer be copied.</p>
          )}
        </aside>
      </main>
    </>
  );
}
