import Link from "next/link";

const followers = [["Follower 1", "Copied $50", 0, 0.3], ["Follower 2", "Auto-copied $25", 18, 0.7], ["Follower 3", "Copied $100", 36, 1.1], ["Follower 4", "Auto-copied $50", 18, 1.5], ["Follower 5", "Copied $250", 0, 1.9]] as const;
const steps = [
  ["01", "A trader calls it", "Entry, stop and target go live as one real order. No vague signals."],
  ["02", "Your phone lights up", "The call lands in Telegram, with updates when it fills, moves, cancels or closes."],
  ["03", "You copy, protected", "Tap once, or let auto-copy handle it within your limits. The stop and target come with it."],
];
const orders = [
  ["Limit", "Enter only at your price or better."], ["Stop loss", "Cap the downside automatically."],
  ["Take profit", "Lock in gains at your target."], ["Bracket", "Stop and target together. One fires, the other cancels."],
  ["TWAP", "Spread a large order over time."], ["Trailing stop", "A stop that follows the price up."],
  ["Stop buy", "Enter on a breakout."], ["Cross-chain", "Market orders between chains."],
];

export default function Landing() {
  return (
    <div style={{ overflow: "hidden", fontSize: 16 }}>
      <header className="wrap between" style={{ padding: "18px 24px", alignItems: "center", flexWrap: "wrap" }}>
        <Link href="/" className="h" style={{ fontSize: 24, fontWeight: 700 }}>Flashmob</Link>
        <nav className="row" style={{ gap: 22, fontWeight: 500 }}>
          <a href="#how">How it works</a>
          <a href="#orders">Orders</a>
          <Link href="/home" className="btn pri">Open app</Link>
        </nav>
      </header>

      <section className="wrap cols" style={{ padding: "56px 24px 64px", gap: 48, alignItems: "center" }}>
        <div style={{ flex: "999 1 520px", minWidth: 0 }}>
          <h1 className="hero">One call.<br /><span className="up">Everyone moves.</span></h1>
          <p style={{ margin: "24px 0 30px", fontSize: 20, lineHeight: 1.5, color: "#C9D2DC", maxWidth: 560 }}>
            Follow traders with records built from real fills. Get their calls in Telegram, then copy in one tap with the stop and target already attached.
          </p>
          <div className="row">
            <Link href="/home" className="btn pri" style={{ minHeight: 50 }}>See the traders</Link>
            <a href="https://t.me/flashmob_trade_bot" className="btn" style={{ minHeight: 50 }}>Add the Telegram bot</a>
          </div>
        </div>
        <div style={{ flex: "1 1 400px", minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="card" style={{ padding: 18, borderColor: "var(--lime)" }}>
            <div className="between" style={{ alignItems: "center" }}><strong>Slow Tide published a call</strong><span className="tag">Sample</span></div>
            <div className="h" style={{ fontSize: 26, fontWeight: 700, margin: "8px 0" }}>Long WETH on Base</div>
            <div className="m row" style={{ fontSize: 13 }}>
              <span className="mut">Entry <span style={{ color: "var(--text)" }}>$3,420</span></span>
              <span className="mut">Stop <span className="dn">$3,280</span></span>
              <span className="mut">Target <span className="up">$3,760</span></span>
            </div>
          </div>
          {followers.map(([name, action, indent, delay]) => (
            <div key={name} className="card hit between" style={{ padding: "11px 16px", fontSize: 14, marginLeft: indent, animationDelay: `${delay}s` }}>
              <span>{name}</span><span className="m up">{action}</span>
            </div>
          ))}
        </div>
      </section>

      <section id="how" className="wrap" style={{ paddingTop: 72, paddingBottom: 88 }}>
        <h2 className="big" style={{ marginBottom: 32 }}>From call to copied in one tap</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(270px,1fr))", gap: 16 }}>
          {steps.map(([n, title, text]) => (
            <article key={n} className="card" style={{ padding: 26 }}>
              <div className="m up">{n}</div>
              <h3 style={{ margin: "34px 0 10px", fontSize: 26 }}>{title}</h3>
              <p className="mut" style={{ margin: 0, lineHeight: 1.55 }}>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section style={{ background: "var(--lime)", color: "var(--bg)" }}>
        <div className="wrap" style={{ paddingTop: 72, paddingBottom: 72 }}>
          <h2 style={{ fontSize: "clamp(40px,6vw,76px)", lineHeight: 1, letterSpacing: -2 }}>No screenshots.<br />Just fills.</h2>
          <p style={{ margin: "20px 0 0", fontSize: 20, lineHeight: 1.5, maxWidth: 620 }}>
            Every call is a real onchain order, so win rate, drawdown and returns come from what actually executed. You can even see how copiers did, not only the trader.
          </p>
        </div>
      </section>

      <section id="orders" className="wrap" style={{ paddingTop: 88, paddingBottom: 88 }}>
        <h2 className="big" style={{ marginBottom: 10 }}>More than a market buy</h2>
        <p className="mut" style={{ margin: "0 0 32px", fontSize: 18 }}>Advanced orders on every EVM chain Flash supports, executed by Definitive Flash.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
          {orders.map(([name, text]) => (
            <div key={name} className="card" style={{ padding: 18 }}>
              <div className="h" style={{ fontSize: 20, fontWeight: 700 }}>{name}</div>
              <div className="mut" style={{ marginTop: 6, fontSize: 14, lineHeight: 1.45 }}>{text}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="wrap" style={{ paddingBottom: 40, textAlign: "center", borderTop: "1px solid var(--line)", paddingTop: 72 }}>
        <h2 style={{ fontSize: "clamp(40px,6vw,72px)", letterSpacing: -2, marginBottom: 24 }}>Don&apos;t trade alone.</h2>
        <Link href="/home" className="btn pri">Open app</Link>
        <p className="mut" style={{ margin: "44px auto 0", fontSize: 13, lineHeight: 1.5, maxWidth: 640 }}>
          Trading crypto carries risk, including loss of your funds. Past results don&apos;t predict future returns. Copying a trader can produce different results from theirs.
        </p>
      </section>
    </div>
  );
}
