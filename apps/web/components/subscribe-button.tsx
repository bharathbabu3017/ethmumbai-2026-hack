"use client";

import { useEffect, useState } from "react";
import { ensureSession, fetchMe, postJson } from "@/lib/account";
import { plainError } from "@/lib/format";
import { useWallet } from "@/lib/wallet";

export function SubscribeButton({ traderId, initial, onChange }: { traderId: string; initial: boolean; onChange?(on: boolean): void }) {
  const { address, login, getSigner } = useWallet();
  const [subscribed, setSubscribed] = useState(initial);
  const [linked, setLinked] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (address) fetchMe().then((me) => setLinked(!!me.telegramLinked)).catch(() => {});
  }, [address]);

  const toggle = async () => {
    setError("");
    if (!address) return login();
    setBusy(true);
    try {
      const me = await ensureSession(getSigner);
      await postJson("/api/follows", { traderId, on: !subscribed });
      setLinked(!!me.telegramLinked);
      setSubscribed(!subscribed);
      onChange?.(!subscribed);
    } catch (e) {
      setError(plainError(e));
    } finally {
      setBusy(false);
    }
  };

  const linkTelegram = async () => {
    const { url } = await postJson<{ url: string }>("/api/telegram/link");
    window.open(url, "_blank");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <button className={`btn ${subscribed ? "" : "pri"}`} disabled={busy} onClick={toggle}>{subscribed ? "Unsubscribe" : "Subscribe"}</button>
      {subscribed && !linked && <button className="btn" onClick={linkTelegram}>Link Telegram to receive alerts</button>}
      {error && <span role="alert" className="dn" style={{ fontSize: 13 }}>{error}</span>}
    </div>
  );
}
