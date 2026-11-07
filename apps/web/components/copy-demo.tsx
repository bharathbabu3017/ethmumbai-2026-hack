"use client";

import { useEffect, useState } from "react";

// How long each step of the story stays on screen.
const STEPS_MS = [1000, 800, 700, 1500, 700, 900, 900, 3600, 450, 60];
const SETTLED = 7;
const FADED = 8;
const RESET = 9;

const PRICE = "$2,252.66";

function Status({ done, doing, finished }: { done: boolean; doing: string; finished: string }) {
  return <span className={`demo-status ${done ? "live" : ""}`}>{done ? finished : <><span className="spin" />{doing}</>}</span>;
}

function Line({ on }: { on: boolean }) {
  return <div className="demo-line" aria-hidden="true"><span className={on ? "live" : ""} /></div>;
}

function Head({ n, title, lit }: { n: number; title: string; lit: boolean }) {
  return <div className={`demo-head ${lit ? "live" : ""}`}><span className="land-num">{n}</span>{title}</div>;
}

function Facts({ rows }: { rows: [string, string][] }) {
  return <pre>{rows.map(([k, v]) => `${k.padEnd(8)}${v}`).join("\n")}</pre>;
}

/** One copied trade, played start to finish: the trader buys, Telegram alerts you, and your wallet follows at your size. */
export function CopyDemo() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return setStep(SETTLED);
    const timer = setTimeout(() => setStep((s) => (s + 1) % STEPS_MS.length), STEPS_MS[step]);
    return () => clearTimeout(timer);
  }, [step]);

  const at = (n: number) => step >= n && step !== RESET;
  const show = (n: number) => `demo-in ${at(n) ? "live" : ""}`;

  return (
    <div className={`demo ${step >= FADED ? "out" : ""} ${step === RESET ? "still" : ""}`} role="img" aria-label="Example: a trader buys $500 of WETH, you get a Telegram alert, and your wallet copies it at your own $10 limit">
      <section className={`demo-card ${step <= 1 ? "lit" : ""}`}>
        <Head n={1} title="Trader buys" lit={step <= 1} />
        <div className="demo-who"><span className="demo-avatar">TR</span><span><strong>Trader</strong><span className="mut">Public record</span></span></div>
        <div className="demo-order">
          <div className="between"><strong>Buy WETH</strong><span className="m">$500.00</span></div>
          <div className="between"><span className="mut m">{PRICE}</span><Status done={at(1)} doing="Placing" finished="Filled" /></div>
        </div>
        <p className="mut demo-note">Every order is public.</p>
      </section>

      <Line on={at(2)} />

      <section className={`demo-card ${step === 2 || step === 3 || step === SETTLED ? "lit" : ""}`}>
        <Head n={2} title="Telegram alerts you" lit={step === 2 || step === 3 || step === SETTLED} />
        <div className="demo-chat">
          <div className={`tg-msg ${show(3)}`}>
            <strong>🟢 Trader bought WETH</strong>
            <Facts rows={[["Size", "$500.00"], ["Price", PRICE]]} />
            <span className="demo-copy">Copy</span>
          </div>
          <div className={`tg-msg ${show(SETTLED)}`}>
            <strong>🔁 Auto-copied Trader: bought WETH</strong>
            <Facts rows={[["Paid", "$10.00"], ["Price", PRICE]]} />
          </div>
        </div>
      </section>

      <Line on={at(4)} />

      <section className={`demo-card ${step >= 4 && step <= 6 ? "lit" : ""}`}>
        <Head n={3} title="Your wallet copies" lit={step >= 4 && step <= 6} />
        <div className="between"><span className="mut">Your limit</span><span className="m">$10.00 per trade</span></div>
        <div className={`demo-order ${show(5)}`}>
          <div className="between"><strong>Buy WETH</strong><span className="m">$10.00</span></div>
          <div className="between"><span className="mut">Auto-copy</span><Status done={at(6)} doing="Copying" finished="Filled" /></div>
        </div>
        <div>
          <div className="between"><span className="mut">Used today</span><span className="m">{at(6) ? "$10" : "$0"} of $50</span></div>
          <div className="demo-bar"><span className={at(6) ? "live" : ""} /></div>
        </div>
        <p className="mut demo-note">Anything over your limits is skipped.</p>
      </section>
    </div>
  );
}
