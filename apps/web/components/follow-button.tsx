"use client";

import { useState } from "react";
import { ensureSession, postJson } from "@/lib/account";
import { useWallet } from "@/lib/wallet";

export function FollowButton({ traderId, initial }: { traderId: string; initial: boolean }) {
  const { address, login, getSigner } = useWallet();
  const [following, setFollowing] = useState(initial);
  const [needsTelegram, setNeedsTelegram] = useState(false);
  const [error, setError] = useState("");

  const toggle = async () => {
    setError("");
    if (!address) return login();
    try {
      const me = await ensureSession(getSigner);
      await postJson("/api/follows", { traderId, on: !following });
      setFollowing(!following);
      setNeedsTelegram(!following && !me.telegramLinked);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    }
  };

  const linkTelegram = async () => {
    const { url } = await postJson<{ url: string }>("/api/telegram/link");
    window.open(url, "_blank");
    setNeedsTelegram(false);
  };

  return (
    <div className="row">
      <button className={`btn ${following ? "" : "pri"}`} onClick={toggle}>{following ? "Following" : "Follow"}</button>
      {needsTelegram && <button className="btn" onClick={linkTelegram}>Link Telegram for alerts</button>}
      {error && <span role="alert" className="dn">{error}</span>}
    </div>
  );
}
