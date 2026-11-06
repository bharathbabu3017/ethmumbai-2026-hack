import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/logo";
import { MobDiagram } from "@/components/mob-diagram";
import { ProtectDiagram } from "@/components/protect-diagram";
import { Reveal } from "@/components/reveal";
import { SkipLanding } from "@/components/skip-landing";
import { ThemeToggle } from "@/components/theme-toggle";

const ORDER_TYPES = ["Market", "Limit", "Stop", "Take profit", "Bracket", "TWAP", "Trailing stop"];

const limits = [["Per trade", "$1.00"], ["Daily limit", "$10.00"], ["When they sell", "You sell too"]];

function Tile({ title, text, href, link, children }: { title: string; text: string; href: string; link: string; children: ReactNode }) {
  return (
    <article className="panel land-tile">
      <div className="between" style={{ alignItems: "baseline" }}>
        <h3>{title}</h3>
        <Link href={href} className="mut" style={{ fontSize: 13, flex: "none" }}>{link} →</Link>
      </div>
      <p className="mut">{text}</p>
      <div className="land-visual">{children}</div>
    </article>
  );
}

export default function Landing() {
  return (
    <div className="wrap wide">
      <SkipLanding />
      <header className="between" style={{ padding: "18px 0", alignItems: "center" }}>
        <Logo href="/" />
        <nav className="row" style={{ gap: 8 }}>
          <ThemeToggle />
          <Link href="/home" className="btn">Open app</Link>
        </nav>
      </header>

      <section className="rise" style={{ padding: "clamp(40px,8vh,80px) 0 clamp(56px,9vh,96px)", textAlign: "center" }}>
        <h1 className="hero">Copy traders and AI agents</h1>
        <p className="mut" style={{ margin: "18px 0 28px", fontSize: 20 }}>Every trade is public. Every limit is yours.</p>
        <div className="row" style={{ justifyContent: "center" }}>
          <Link href="/home" className="btn pri">Browse traders</Link>
          <Link href="/agents/new" className="btn">Build an agent</Link>
        </div>
        <div style={{ maxWidth: 1000, margin: "48px auto 0" }}><MobDiagram /></div>
      </section>

      <Reveal className="sec">
        <section className="land-tiles">
          <Tile title="Auto-copy" text="Your wallet follows their trades, at your size." href="/home" link="Find a trader">
            {limits.map(([label, value]) => <div key={label} className="between land-line"><span className="mut">{label}</span><span>{value}</span></div>)}
          </Tile>
          <Tile title="AI agents" text="Pick a strategy, set the limits, read every decision." href="/agents/new" link="Build an agent">
            <div className="between" style={{ alignItems: "center" }}><span style={{ fontWeight: 600 }}>Waited</span><span className="agent-badge">AI agent</span></div>
            <p style={{ margin: "6px 0 0" }}>WETH is down only 1.24%, so no clear dip to buy.</p>
          </Tile>
          <Tile title="Stops and targets" text="Your exits run even when you're offline." href="/trade" link="Open Trade">
            <ProtectDiagram />
          </Tile>
          <Tile title="Telegram" text="Alerts and trading, in one chat." href="https://t.me/flashmob_trade_bot" link="Open the bot">
            <div className="tg-msg"><strong>🔁 Auto-copied Trader: bought WETH</strong><pre>{"Paid    $1.00\nPrice   $2,252.66"}</pre></div>
          </Tile>
        </section>
        <div className="land-chips">{ORDER_TYPES.map((type) => <span key={type}>{type}</span>)}</div>
      </Reveal>

      <footer className="mut" style={{ borderTop: "1px solid var(--line)", padding: "22px 0 34px", fontSize: 12 }}>
        Amounts shown are examples. Orders run on Base through Definitive Flash. Trading crypto is risky, and you can lose your funds.
      </footer>
    </div>
  );
}
