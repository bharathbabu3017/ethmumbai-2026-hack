"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AddFunds } from "@/components/add-funds";
import { ensureSession, fetchMe, postJson, type Me } from "@/lib/account";
import { flash } from "@/lib/flash";
import { useWallet } from "@/lib/wallet";

const MIN_FUNDED_USD = 1;

function Step({ done, title, text, action }: { done: boolean; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="row" style={{ flexWrap: "nowrap", alignItems: "flex-start" }}>
      <span className={`check ${done ? "done" : ""}`} aria-label={done ? "Done" : "To do"}>{done ? "✓" : ""}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 500 }}>{title}</div>
        <div className="mut" style={{ fontSize: 13 }}>{text}</div>
        {!done && action && <div style={{ marginTop: 8 }}>{action}</div>}
      </div>
    </div>
  );
}

/** Shows new users what the product does, using their real progress. */
export function GettingStarted({ signedIn }: { signedIn: boolean }) {
  const { address, ready, login, getSigner } = useWallet();
  const [me, setMe] = useState<Me>();
  const [funded, setFunded] = useState(false);
  const [funds, setFunds] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchMe().then(setMe).catch(() => {});
    if (address) flash.balances(address).then((r) => setFunded(r.balances.some((b) => Number(b.notional) >= MIN_FUNDED_USD))).catch(() => {});
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

  return (
    <section className="panel" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <h2 style={{ fontSize: 18 }}>Start copying in three steps</h2>
        <p className="mut" style={{ margin: "4px 0 0" }}>Browsing needs no account. Sign in when you&apos;re ready to copy.</p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 16 }}>
        <Step done={signedIn || !!address} title="Sign in" text="Your wallet is created for you." action={ready ? <button className="btn" onClick={login}>Sign in</button> : undefined} />
        <Step done={funded} title="Add funds" text="USDC to trade with, and a little ETH on Base." action={address ? <button className="btn" onClick={() => setFunds(true)}>Add funds</button> : undefined} />
        <Step done={false} title="Pick a trader" text="Set your limits, and your wallet copies them." />
        <Step done={!!me?.telegramLinked} title="Link Telegram (optional)" text="Get a message for trades and copies." action={address ? <button className="btn" onClick={linkTelegram}>Link Telegram</button> : undefined} />
      </div>
      {error && <p role="alert" className="dn" style={{ margin: 0 }}>{error}</p>}
      {funds && address && <AddFunds address={address} onClose={() => setFunds(false)} />}
    </section>
  );
}
