"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AddFunds } from "@/components/add-funds";
import { ensureSession, fetchMe, postJson, type Me } from "@/lib/account";
import { flash } from "@/lib/flash";
import { useWallet } from "@/lib/wallet";

const MIN_FUNDED_USD = 1;

function Step({ done, title, text, action }: { done: boolean; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="row" style={{ flexWrap: "nowrap", alignItems: "center" }}>
      <span className={`check ${done ? "done" : ""}`} aria-label={done ? "Done" : "To do"}>{done ? "✓" : ""}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 500 }}>{title}</div>
        <div className="mut" style={{ fontSize: 13 }}>{text}</div>
      </div>
      {!done && action && <div style={{ flex: "none" }}>{action}</div>}
    </div>
  );
}

/** Shows new users what the product does, using their real progress. Folds to one line once they've signed in. */
export function GettingStarted({ signedIn, saved }: { signedIn: boolean; saved?: string }) {
  const { address, ready, login, getSigner } = useWallet();
  const [me, setMe] = useState<Me>();
  const [funded, setFunded] = useState<boolean>();
  const [funds, setFunds] = useState(false);
  const [error, setError] = useState("");
  const [choice, setChoice] = useState(saved);
  const open = choice ? choice === "open" : !signedIn;

  useEffect(() => {
    fetchMe().then(setMe).catch(() => {});
    if (!address) return setFunded(false);
    flash.balances(address).then((r) => setFunded(r.balances.some((b) => Number(b.notional) >= MIN_FUNDED_USD))).catch(() => setFunded(false));
  }, [address]);

  const linkTelegram = async () => {
    setError("");
    try {
      await ensureSession(getSigner);
      const { url } = await postJson<{ url: string }>("/api/telegram/link");
      window.open(url, "_blank");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    }
  };

  // A cookie, so the server renders the right size and the panel never jumps on load.
  const toggle = () => {
    const next = open ? "closed" : "open";
    document.cookie = `getStarted=${next}; path=/; max-age=31536000; samesite=lax`;
    setChoice(next);
  };

  const steps = [
    { done: signedIn || !!address, title: "Sign in", text: "Your wallet is created for you.", action: ready ? <button className="asset" onClick={login}>Sign in</button> : undefined },
    { done: !!funded, title: "Add funds", text: "USDC to trade with, and a little ETH on Base.", action: address ? <button className="asset" onClick={() => setFunds(true)}>Add</button> : undefined },
    { done: false, title: "Pick a trader", text: "Set your limits, and your wallet copies them." },
    { done: !!me?.telegramLinked, title: "Link Telegram (optional)", text: "Get a message for trades and copies.", action: address ? <button className="asset" onClick={linkTelegram}>Link</button> : undefined },
  ];
  const loaded = funded !== undefined && !!me;
  const next = steps.find((s) => !s.done);

  return (
    <section className="panel" style={{ display: "flex", flexDirection: "column", gap: 12, padding: "10px 16px" }}>
      <div className="between" style={{ alignItems: "center", minHeight: 36 }}>
        <div className="row" style={{ gap: 12 }}>
          <span style={{ fontWeight: 600 }}>Get started</span>
          {loaded && <span className="mut" style={{ fontSize: 13 }}>{steps.filter((s) => s.done).length} of {steps.length} done</span>}
          {loaded && !open && next && <span style={{ fontSize: 13 }}><span className="mut">Next:</span> {next.title}</span>}
        </div>
        <div className="row" style={{ gap: 8 }}>
          {loaded && !open && next?.action}
          <button className="asset" aria-expanded={open} onClick={toggle}>{open ? "Hide" : "Show steps"}</button>
        </div>
      </div>
      {open && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: "10px 32px", paddingBottom: 6 }}>
          {steps.map((step) => <Step key={step.title} {...step} />)}
        </div>
      )}
      {error && <p role="alert" className="dn" style={{ margin: 0 }}>{error}</p>}
      {funds && address && <AddFunds address={address} onClose={() => setFunds(false)} />}
    </section>
  );
}
