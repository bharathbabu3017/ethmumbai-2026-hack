import Link from "next/link";

const steps = [
  ["A trader calls it", "Entry, stop and target go live as one real order."],
  ["You get the alert", "In Telegram, with updates when it fills, moves or closes."],
  ["You copy, protected", "One tap, or automatic within your limits."],
];

export default function Landing() {
  return (
    <div className="wrap">
      <header className="between" style={{ padding: "22px 0", alignItems: "center" }}>
        <Link href="/" style={{ fontSize: 16, fontWeight: 600 }}>Flashmob</Link>
        <Link href="/home" className="btn">Open app</Link>
      </header>

      <section style={{ padding: "clamp(72px,14vh,150px) 0 clamp(72px,12vh,130px)", maxWidth: 780 }}>
        <h1 className="hero">One call.<br /><span className="mut">Everyone moves.</span></h1>
        <p className="mut" style={{ margin: "26px 0 34px", fontSize: 18, maxWidth: 520 }}>
          Copy traders whose records are built from real fills, with the stop and target already attached.
        </p>
        <div className="row">
          <Link href="/home" className="btn pri">See the traders</Link>
          <a href="https://t.me/flashmob_trade_bot" className="btn">Open in Telegram</a>
        </div>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 40, paddingBottom: 110 }}>
        {steps.map(([title, text]) => (
          <div key={title} style={{ borderTop: "1px solid var(--line)", paddingTop: 18 }}>
            <h2 style={{ fontSize: 17, marginBottom: 6 }}>{title}</h2>
            <p className="mut" style={{ margin: 0, fontSize: 15 }}>{text}</p>
          </div>
        ))}
      </section>

      <section style={{ paddingBottom: 110, maxWidth: 780 }}>
        <h2 className="big">No screenshots. Just fills.</h2>
        <p className="mut" style={{ margin: "12px 0 0", fontSize: 16, maxWidth: 560 }}>
          Every call is a real onchain order, executed by Definitive Flash. Limit, stop, take profit, bracket, TWAP and more.
        </p>
      </section>

      <footer className="mut" style={{ borderTop: "1px solid var(--line)", padding: "22px 0 34px", fontSize: 12, maxWidth: "none" }}>
        Trading crypto carries risk, including loss of your funds. Past results don&apos;t predict future returns, and copying a trader can produce different results.
      </footer>
    </div>
  );
}
