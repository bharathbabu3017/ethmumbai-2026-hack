"use client";

import { useEffect, useRef, useState } from "react";
import { WalletAddress } from "@/components/wallet-address";
import { useWallet } from "@/lib/wallet";

export function WalletMenu({ address }: { address: string }) {
  const { logout, miniApp } = useWallet();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  return (
    <div ref={box} style={{ position: "relative" }}>
      <button className="btn m" aria-expanded={open} onClick={() => setOpen(!open)}>{address.slice(0, 6)}…{address.slice(-4)}</button>
      {open && (
        <div className="panel" style={{ position: "absolute", right: 0, top: "100%", marginTop: 6, width: 300, zIndex: 20, display: "flex", flexDirection: "column", gap: 12, background: "var(--bg)" }}>
          <div style={{ fontWeight: 500 }}>{miniApp ? "Your Telegram wallet" : "Your wallet"}</div>
          <WalletAddress address={address} />
          {!miniApp && <button className="btn warn" style={{ minHeight: 36 }} onClick={() => { setOpen(false); logout(); }}>Disconnect</button>}
        </div>
      )}
    </div>
  );
}
