"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usd } from "@/lib/format";
import type { Market } from "@/lib/markets";

export function MarketStrip() {
  const [markets, setMarkets] = useState<Market[]>([]);
  useEffect(() => {
    fetch("/api/markets").then((r) => r.json()).then((j) => setMarkets(j.markets)).catch(() => {});
  }, []);
  if (!markets.length) return <div className="strip" style={{ minHeight: 42 }} />;
  return (
    <div className="strip" style={{ fontSize: 13 }}>
      {markets.map((m) => (
        <Link key={m.address} href={`/trade?token=${m.address}`} style={{ whiteSpace: "nowrap" }}>
          <span style={{ fontWeight: 500 }}>{m.symbol}</span> <span className="m mut">{usd(m.price)}</span>{" "}
          <span className={`m ${m.change24h < 0 ? "dn" : "up"}`}>{m.change24h >= 0 ? "+" : ""}{m.change24h.toFixed(1)}%</span>
        </Link>
      ))}
    </div>
  );
}
