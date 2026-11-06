"use client";

import { useEffect, useState } from "react";
import { ensureSession, fetchMe, postJson } from "@/lib/account";
import { plainError } from "@/lib/format";
import { useWallet } from "@/lib/wallet";

const Bell = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8" /><path d="M10 20a2 2 0 0 0 4 0" />
  </svg>
);

/** The alerts bell. With `compact` it's icon-only, for rows in a list. */
export function SubscribeButton({ traderId, initial, compact, onChange }: { traderId: string; initial: boolean; compact?: boolean; onChange?(on: boolean): void }) {
  const { address, ready, login, getSigner } = useWallet();
  const [subscribed, setSubscribed] = useState(initial);
  const [linked, setLinked] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => setSubscribed(initial), [initial]);
  useEffect(() => {
    if (address && !compact) fetchMe().then((me) => setLinked(!!me.telegramLinked)).catch(() => {});
  }, [address, compact]);

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

  const label = subscribed ? "Telegram alerts are on. Tap to turn off." : "Turn on Telegram alerts";
  return (
    <span className="row" style={{ gap: 8 }}>
      <button className={`btn ${compact ? "icon" : ""}`} style={{ gap: 8, color: subscribed ? "var(--up)" : undefined }} disabled={busy || !ready} aria-label={label} title={label} onClick={toggle}>
        <Bell />{!compact && (subscribed ? "Alerts on" : "Get alerts")}
      </button>
      {!compact && subscribed && !linked && <button className="btn" onClick={linkTelegram}>Link Telegram</button>}
      {error && <span role="alert" className="dn" style={{ fontSize: 13 }}>{error}</span>}
    </span>
  );
}
