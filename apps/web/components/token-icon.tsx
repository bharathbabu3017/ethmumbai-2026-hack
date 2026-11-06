"use client";

import { useEffect, useState } from "react";

const loaded = new Map<string, Promise<string | null>>();

function iconFor(address: string) {
  const key = address.toLowerCase();
  let icon = loaded.get(key);
  if (!icon) {
    icon = fetch(`/api/icon/${address}`).then((r) => r.json()).then((r) => r.imageUrl ?? null).catch(() => null);
    loaded.set(key, icon as Promise<string | null>);
  }
  return icon as Promise<string | null>;
}

/** A token's logo, or its first letters until there is one. */
export function TokenIcon({ token, size = 24 }: { token: { symbol: string; address?: string | null; imageUrl?: string | null }; size?: number }) {
  const [image, setImage] = useState(token.imageUrl ?? null);
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    if (token.imageUrl) return setImage(token.imageUrl);
    let stale = false;
    if (token.address) void iconFor(token.address).then((url) => { if (!stale) setImage(url); });
    return () => { stale = true; };
  }, [token.address, token.imageUrl]);

  const box = { width: size, height: size, borderRadius: "50%", flex: "none" as const };
  if (image && !broken) return <img src={image} alt="" style={box} onError={() => setBroken(true)} />;
  return <span aria-hidden="true" style={{ ...box, background: "var(--soft)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: size / 2.6, fontWeight: 600 }}>{token.symbol.slice(0, 2)}</span>;
}

/** The two sides of a swap, overlapped. */
export function SwapIcons({ from, to, size = 24 }: { from: { symbol: string; address?: string | null }; to: { symbol: string; address?: string | null }; size?: number }) {
  return (
    <span style={{ display: "inline-flex", flex: "none" }}>
      <TokenIcon token={from} size={size} />
      <span style={{ marginLeft: -size / 3, display: "inline-flex" }}><TokenIcon token={to} size={size} /></span>
    </span>
  );
}
