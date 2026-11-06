"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { ensureSession, fetchMe, postJson, type Me } from "@/lib/account";
import { useWallet } from "@/lib/wallet";

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
export function GettingStarted() {
  const { address, login, getSigner } = useWallet();
  const [me, setMe] = useState<Me>();
  const [error, setError] = useState("");

  useEffect(() => { fetchMe().then(setMe).catch(() => {}); }, [address]);

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

  const connected = !!address;
  const linked = !!me?.telegramLinked;
  const following = (me?.following?.length ?? 0) > 0;
  const copied = (me?.copies?.length ?? 0) > 0;
  if (connected && linked && following && copied) return null;

  return (
    <section className="panel" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <h2 style={{ fontSize: 16 }}>Start copying in 4 steps</h2>
      <Step done={connected} title="Connect a wallet" text="Your funds stay in your wallet until an order fills." action={<button className="btn pri" onClick={login}>Connect</button>} />
      <Step done={linked} title="Link Telegram" text="This is how you get trade alerts." action={connected ? <button className="btn" onClick={linkTelegram}>Link Telegram</button> : undefined} />
      <Step done={following} title="Follow a trader" text="Get an alert every time they trade." />
      <Step done={copied} title="Copy a trade" text="Pick an amount and sign. Your stop and target come with it." />
      {error && <p role="alert" className="dn" style={{ margin: 0 }}>{error}</p>}
    </section>
  );
}
