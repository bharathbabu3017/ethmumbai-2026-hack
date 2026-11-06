import Link from "next/link";
import { CopyDiagram } from "@/components/copy-diagram";
import { ProtectDiagram } from "@/components/protect-diagram";
import { Reveal } from "@/components/reveal";
import { ThemeToggle } from "@/components/theme-toggle";

const steps = [
  ["1. Pick a trader", "Compare traders by win rate, returns and past trades."],
  ["2. Follow them", "Link Telegram and get a message every time they trade."],
  ["3. Copy the trade", "Open their trade, choose your amount, and sign it from your wallet."],
];

const features = [
  ["Verified track records", "Every order a trader places on Flashmob counts, so win rate and returns come from real fills, and losing trades can't be hidden."],
  ["Telegram alerts", "Get a message when a trader places, fills, cancels or closes a trade."],
  ["Copy buys and exits", "Copy market, limit, stop, TWAP and trailing buys. When a trader sells, you get a prompt to sell the same share."],
  ["Auto-copy (coming soon)", "Trades placed for you, with an amount per trade, a daily limit, and a pause button."],
  ["Advanced orders", "Market, limit, stop loss, take profit, bracket, TWAP and trailing stop orders."],
  ["Trade on the web or in Telegram", "Place and cancel orders from your wallet on the website, or with simple commands in the bot."],
];

const wallets = [
  ["On the web", "Connect your own wallet, or log in with email. You sign every order, and your funds stay in your wallet until it fills."],
  ["In Telegram", "The bot creates a trading wallet for you. Flashmob holds its key so the bot can trade for you, and you can export the key any time."],
];

export default function Landing() {
  return (
    <div className="wrap">
      <header className="between" style={{ padding: "18px 0", alignItems: "center" }}>
        <Link href="/" style={{ fontSize: 16, fontWeight: 600 }}>Flashmob</Link>
        <nav className="row" style={{ gap: 8 }}>
          <a href="#how" className="mut" style={{ padding: "0 10px" }}>How it works</a>
          <a href="#features" className="mut" style={{ padding: "0 10px" }}>Features</a>
          <ThemeToggle />
          <Link href="/home" className="btn">Open app</Link>
        </nav>
      </header>

      <section className="cols sec" style={{ paddingTop: "clamp(48px,10vh,110px)", alignItems: "center", gap: 40 }}>
        <div className="rise" style={{ flex: "999 1 480px", minWidth: 0 }}>
          <h1 className="hero">Copy crypto traders, trade by trade</h1>
          <p className="mut" style={{ margin: "22px 0 30px", fontSize: 18, maxWidth: 540 }}>
            Follow traders with verified onchain records. Get a Telegram alert when they trade, then copy it with your own amount, stop loss and take profit.
          </p>
          <div className="row">
            <Link href="/home" className="btn pri">Browse traders</Link>
            <a href="https://t.me/flashmob_trade_bot" className="btn">Open the Telegram bot</a>
          </div>
        </div>
        <div className="rise" style={{ flex: "1 1 380px", minWidth: 0, animationDelay: ".15s" }}>
          <CopyDiagram />
        </div>
      </section>

      <Reveal className="sec">
        <section id="how">
          <h2 className="big" style={{ marginBottom: 28 }}>How it works</h2>
          <div className="grid3">
            {steps.map(([title, text]) => <div key={title} className="item"><h3>{title}</h3><p>{text}</p></div>)}
          </div>
        </section>
      </Reveal>

      <Reveal className="sec">
        <section className="cols" style={{ alignItems: "center", gap: 48 }}>
          <div style={{ flex: "1 1 360px", minWidth: 0 }}>
            <h2 className="big">Copy with a stop loss and take profit</h2>
            <p className="mut" style={{ margin: "14px 0 0", fontSize: 16 }}>
              If a trader sets exit levels, they come with the copy, and you can change them or add your own. Your position sells automatically at whichever level is reached first, even when you&apos;re offline.
            </p>
          </div>
          <div style={{ flex: "1 1 400px", minWidth: 0 }}><ProtectDiagram /></div>
        </section>
      </Reveal>

      <Reveal className="sec">
        <section id="features">
          <h2 className="big" style={{ marginBottom: 28 }}>Features</h2>
          <div className="grid3">
            {features.map(([title, text]) => <div key={title} className="item"><h3>{title}</h3><p>{text}</p></div>)}
          </div>
        </section>
      </Reveal>

      <Reveal className="sec">
        <section>
          <h2 className="big" style={{ marginBottom: 28 }}>Two ways to use it</h2>
          <div className="grid3">
            {wallets.map(([title, text]) => <div key={title} className="item"><h3>{title}</h3><p>{text}</p></div>)}
          </div>
        </section>
      </Reveal>

      <Reveal className="sec">
        <section>
          <h2 className="big" style={{ marginBottom: 12 }}>Fees and chains</h2>
          <p className="mut" style={{ margin: 0, fontSize: 16, maxWidth: 640 }}>
            Flashmob charges 0.10% per trade. Definitive also charges a fee on advanced orders, and every quote shows the full cost before you confirm. Trading is on Base, using USDC, with more chains planned.
          </p>
        </section>
      </Reveal>

      <footer className="mut" style={{ borderTop: "1px solid var(--line)", padding: "22px 0 34px", fontSize: 12 }}>
        Orders are executed by Definitive Flash. Trading crypto carries risk, including loss of your funds. Past results don&apos;t predict future returns, and a copied trade can get a different result from the trader&apos;s.
      </footer>
    </div>
  );
}
