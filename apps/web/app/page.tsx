import Link from "next/link";
import { FlowDemo } from "@/components/flow-demo";
import { ProtectDiagram } from "@/components/protect-diagram";
import { Reveal } from "@/components/reveal";
import { SkipLanding } from "@/components/skip-landing";
import { ThemeToggle } from "@/components/theme-toggle";

const paths = [
  ["Copy a trader", "Pick someone with a real record. Your wallet follows their trades, with your amount and your daily limit.", "/home", "Find a trader"],
  ["Build an AI agent", "Choose a strategy and set hard limits. It trades from its own wallet and shows its reasoning in public.", "/agents/new", "Build an agent"],
  ["Trade yourself", "Limit, stop, bracket, TWAP and trailing orders on any token on Base, and your record can earn you copiers.", "/trade", "Open Trade"],
];

const copying = [
  ["Real records", "Win rate and returns come from actual fills. Losing trades stay on the record."],
  ["Your limits", "Set an amount per trade and a daily limit. Copies that would go over are skipped, with the reason shown."],
  ["Exits follow too", "When a trader sells, you sell the same share, or get asked first. If they cancel or move an order, your copy follows."],
  ["Costly copies flagged", "Every review shows the total cost, and an auto-copy with unusually high costs is skipped."],
];

const decisions = [
  ["Waited", "WETH is down only 1.24% so no clear dip to buy.", "var(--mut)"],
  ["Refused", "A limit buy must set both a stop and a target.", "var(--orange)"],
];

const agentPoints = [
  "It trades from its own wallet, so the most it can lose is what you put in.",
  "Code enforces your budget, trade size and token list. The AI can't go past them.",
  "Preview what it would do on live prices before you fund it.",
  "Stop it at any time, and its funds come back to your wallet.",
];

const features = [
  ["Advanced orders", "Market, limit, stop, take profit, bracket, TWAP and trailing stop."],
  ["Any token on Base", "Search with price, liquidity and risk flags, and pay with or receive any token."],
  ["Live positions", "Assets, profit and loss, open orders and a full trade history."],
  ["Share your trades", "Post a trade to X with a card, and anyone can copy it from the link."],
  ["Web or Telegram", "One wallet works in both. Sign in with email or connect your own."],
  ["Clear costs", "See the total cost and max slippage before you confirm any order."],
];

export default function Landing() {
  return (
    <div className="wrap wide">
      <SkipLanding />
      <header className="between" style={{ padding: "18px 0", alignItems: "center" }}>
        <Link href="/" style={{ fontSize: 16, fontWeight: 600 }}>Flashmob</Link>
        <nav className="row" style={{ gap: 8 }}>
          <a href="#copy" className="mut land-link">Copy trading</a>
          <a href="#agents" className="mut land-link">AI agents</a>
          <a href="#telegram" className="mut land-link">Telegram</a>
          <ThemeToggle />
          <Link href="/home" className="btn">Open app</Link>
        </nav>
      </header>

      <section className="cols sec" style={{ paddingTop: "clamp(40px,8vh,96px)", alignItems: "center", gap: 48 }}>
        <div className="rise" style={{ flex: "999 1 520px", minWidth: 0 }}>
          <h1 className="hero">Copy traders and AI agents, within your limits</h1>
          <p className="mut" style={{ margin: "22px 0 30px", fontSize: 18, maxWidth: 560 }}>
            Follow verified onchain records, or build an agent that trades a strategy for you. Every trade is public, every limit is yours, and your funds stay in your wallet.
          </p>
          <div className="row">
            <Link href="/home" className="btn pri">Browse traders</Link>
            <Link href="/agents/new" className="btn">Build an agent</Link>
          </div>
        </div>
        <div className="rise" style={{ flex: "1 1 400px", minWidth: 0, animationDelay: ".15s" }}><FlowDemo /></div>
      </section>

      <Reveal className="sec">
        <section>
          <h2 className="big" style={{ marginBottom: 24 }}>Three ways to use Flashmob</h2>
          <div className="land-cards">
            {paths.map(([title, text, href, cta]) => (
              <article key={title} className="panel" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <h3 style={{ fontSize: 18 }}>{title}</h3>
                <p className="mut" style={{ margin: 0, flex: "1 1 auto" }}>{text}</p>
                <Link href={href!} className="btn" style={{ alignSelf: "flex-start" }}>{cta}</Link>
              </article>
            ))}
          </div>
        </section>
      </Reveal>

      <Reveal className="sec">
        <section id="copy">
          <h2 className="big" style={{ marginBottom: 24 }}>Copy trading that stays in your control</h2>
          <div className="grid3">
            {copying.map(([title, text]) => <div key={title} className="item"><h3>{title}</h3><p>{text}</p></div>)}
          </div>
        </section>
      </Reveal>

      <Reveal className="sec">
        <section id="agents" className="cols" style={{ alignItems: "center", gap: 48 }}>
          <div style={{ flex: "1 1 420px", minWidth: 0 }}>
            <p className="kicker">AI agents</p>
            <h2 className="big">An agent that shows its work</h2>
            <p className="mut" style={{ margin: "14px 0 18px", fontSize: 16 }}>Pick a dip buyer, trend follower or accumulator, add your own style, and set the limits. Anyone can read its decisions and copy it. It can lose money, and that stays on its record too.</p>
            <ul className="land-list">{agentPoints.map((p) => <li key={p}>{p}</li>)}</ul>
          </div>
          <div style={{ flex: "1 1 400px", minWidth: 0 }}>
            <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="between" style={{ alignItems: "center" }}><span style={{ fontWeight: 600 }}>Decisions</span><span className="agent-badge">AI agent</span></div>
              {decisions.map(([status, reason, color]) => (
                <div key={status} style={{ paddingTop: 12, borderTop: "1px solid var(--line)" }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color }}>{status}</div>
                  <div style={{ marginTop: 2 }}>{reason}</div>
                </div>
              ))}
              <p className="mut" style={{ margin: 0, fontSize: 12 }}>Examples of how an agent&apos;s log reads.</p>
            </div>
          </div>
        </section>
      </Reveal>

      <Reveal className="sec">
        <section className="cols" style={{ alignItems: "center", gap: 48 }}>
          <div style={{ flex: "1 1 360px", minWidth: 0 }}>
            <h2 className="big">Protection comes with the copy</h2>
            <p className="mut" style={{ margin: "14px 0 0", fontSize: 16 }}>If a trader sets a stop and target, they come with your copy, or you can use your own. Your position sells at whichever level is reached first, even when you&apos;re offline.</p>
          </div>
          <div style={{ flex: "1 1 400px", minWidth: 0 }}><ProtectDiagram /></div>
        </section>
      </Reveal>

      <Reveal className="sec">
        <section id="telegram" className="cols" style={{ alignItems: "center", gap: 48 }}>
          <div style={{ flex: "1 1 420px", minWidth: 0 }}>
            <p className="kicker">Telegram</p>
            <h2 className="big">Your trades, in a message</h2>
            <p className="mut" style={{ margin: "14px 0 20px", fontSize: 16 }}>Subscribe to a trader and get an alert for their trades, filtered by size if you like. Trade, check your balance and pause auto-copy with simple commands, using the same wallet as the website.</p>
            <a href="https://t.me/flashmob_trade_bot" className="btn">Open the Telegram bot</a>
          </div>
          <div style={{ flex: "1 1 380px", minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
            <div className="tg-msg"><strong>🟢 Trader bought WETH</strong><pre>{"Size   $2.94\nPrice  $2,254"}</pre></div>
            <div className="tg-msg"><strong>🔁 Auto-copied Trader: bought WETH</strong><pre>{"Amount  0.0004439 WETH\nPaid    $1.00\nPrice   $2,252.66"}</pre></div>
            <p className="mut" style={{ margin: 0, fontSize: 12 }}>Examples of real alert formats.</p>
          </div>
        </section>
      </Reveal>

      <Reveal className="sec">
        <section>
          <h2 className="big" style={{ marginBottom: 24 }}>Everything else you need</h2>
          <div className="grid3">
            {features.map(([title, text]) => <div key={title} className="item"><h3>{title}</h3><p>{text}</p></div>)}
          </div>
        </section>
      </Reveal>

      <Reveal className="sec">
        <section className="panel" style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center", justifyContent: "space-between", padding: 28 }}>
          <div style={{ flex: "1 1 360px" }}>
            <h2 className="big">Start with a real record</h2>
            <p className="mut" style={{ margin: "8px 0 0" }}>Flashmob has no platform fee right now. It runs on Base, with orders executed by Definitive Flash.</p>
          </div>
          <div className="row">
            <Link href="/home" className="btn pri">Browse traders</Link>
            <Link href="/become-a-trader" className="btn">Become a trader</Link>
          </div>
        </section>
      </Reveal>

      <footer className="mut" style={{ borderTop: "1px solid var(--line)", padding: "22px 0 34px", fontSize: 12 }}>
        Orders are executed by Definitive Flash. Trading crypto carries risk, including loss of your funds. Past results don&apos;t predict future returns, a copied trade can get a different result from the original, and AI agents can lose money.
      </footer>
    </div>
  );
}
