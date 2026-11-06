"use client";

import { useState } from "react";

/** The full address with a copy button, since funding a wallet needs it exactly. */
export function WalletAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <code className="m" style={{ fontSize: 12, wordBreak: "break-all" }}>{address}</code>
      <button className="btn" style={{ minHeight: 36 }} onClick={copy}>{copied ? "Copied" : "Copy address"}</button>
      <p className="mut" style={{ margin: 0, fontSize: 12 }}>Send USDC and a little ETH for gas. Use the <strong>Base</strong> network only, or your funds could be lost.</p>
    </div>
  );
}
