import { Nav } from "@/components/nav";
import { calls, traders } from "@/lib/sample";

export default function Home() {
  return (
    <>
      <Nav />
      <main className="wrap" style={{ paddingTop: 28, paddingBottom: 48 }}>
        <div className="between" style={{ alignItems: "flex-end", flexWrap: "wrap", marginBottom: 22 }}>
          <div>
            <h1 style={{ fontSize: 34 }}>Every record backed by real fills</h1>
            <p className="mut" style={{ margin: "6px 0 0" }}>Follow traders, get their calls in Telegram, and copy them with the stop and target attached.</p>
          </div>
          <span className="tag">Sample data until calls go live</span>
        </div>
        <div className="cols">
          <section className="card main" style={{ overflow: "hidden" }}>
            <h2 style={{ fontSize: 18, padding: "16px 18px" }}>Leaderboard</h2>
            <div className="scroll"><div style={{ minWidth: 700 }}>
              <div className="lead mut" style={{ fontSize: 12, fontWeight: 600 }}>
                <span>#</span><span>Trader</span><span>Return</span><span>Win rate</span><span>Drawdown</span><span>Copiers&apos; return</span><span>Copiers</span>
              </div>
              {traders.map((t, i) => (
                <div key={t.name} className="lead">
                  <span className="m mut">{i + 1}</span>
                  <span className="row" style={{ gap: 10, flexWrap: "nowrap" }}>
                    <span className="av" style={{ background: t.color }}>{t.initials}</span>
                    <span><strong style={{ display: "block" }}>{t.name}</strong><span className="mut" style={{ fontSize: 12 }}>{t.calls} calls</span></span>
                  </span>
                  <span className={`m ${t.ret.startsWith("-") ? "dn" : "up"}`}>{t.ret}</span>
                  <span className="m">{t.win}</span>
                  <span className="m dn">{t.dd}</span>
                  <span className={`m ${t.copyRet.startsWith("-") ? "dn" : "up"}`}>{t.copyRet}</span>
                  <span className="m">{t.copiers}</span>
                </div>
              ))}
            </div></div>
          </section>
          <section className="side">
            <h2 style={{ fontSize: 18, padding: "4px 2px" }}>Live calls</h2>
            {calls.map((c) => (
              <article key={c.title} className="card" style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
                <div className="between" style={{ alignItems: "center" }}>
                  <span className="row" style={{ gap: 8 }}>
                    <span className="av" style={{ background: c.color, width: 28, height: 28, fontSize: 11 }}>{c.initials}</span>
                    <strong>{c.who}</strong><span className="mut" style={{ fontSize: 12 }}>{c.age}</span>
                  </span>
                  <span className="tag" style={{ color: c.statusColor }}>{c.status}</span>
                </div>
                <div className="h" style={{ fontSize: 18, fontWeight: 700 }}>{c.title}</div>
                <div className="m row" style={{ fontSize: 12 }}>
                  <span className="mut">Entry <span style={{ color: "var(--text)" }}>{c.entry}</span></span>
                  <span className="mut">Stop <span className="dn">{c.stop}</span></span>
                  <span className="mut">Target <span className="up">{c.target}</span></span>
                </div>
                <span className="mut" style={{ fontSize: 12 }}>{c.foot}</span>
              </article>
            ))}
          </section>
        </div>
      </main>
    </>
  );
}
