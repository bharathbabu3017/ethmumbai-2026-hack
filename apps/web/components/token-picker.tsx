"use client";

import { BASE_TOKENS } from "@flashmob/flash";
import { useEffect, useRef, useState } from "react";
import { flash } from "@/lib/flash";
import { usd } from "@/lib/format";

export interface PickedToken {
  symbol: string;
  address: string;
  riskFlagged: boolean;
}

type Result = PickedToken & { name?: string; price?: string; liquidity?: string };

const compact = (n: number) => `$${Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n)}`;

export function TokenPicker({ value, onChange }: { value: PickedToken; onChange(token: PickedToken): void }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<Result[]>(BASE_TOKENS);
  const [unavailable, setUnavailable] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults(BASE_TOKENS);
      return;
    }
    let stale = false;
    const timer = setTimeout(() => {
      flash.search(q, { chain: "base", limit: 6 })
        .then(({ assets }) => {
          if (stale) return;
          setUnavailable(false);
          setResults(assets);
        })
        .catch(() => {
          if (stale) return;
          setUnavailable(true);
          setResults(BASE_TOKENS.filter((t) => t.symbol.toLowerCase().includes(q.toLowerCase())));
        });
    }, 300);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const pick = (t: PickedToken) => {
    onChange({ symbol: t.symbol, address: t.address, riskFlagged: t.riskFlagged });
    setQuery("");
    setOpen(false);
  };

  const pasted = /^0x[0-9a-fA-F]{40}$/.test(query.trim()) && !results.some((r) => r.address.toLowerCase() === query.trim().toLowerCase());

  return (
    <div ref={box} style={{ position: "relative" }}>
      <label className="lab" htmlFor="token">Token on Base</label>
      <input
        id="token"
        className="inp"
        autoComplete="off"
        placeholder={value.symbol}
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
      />
      {open && (
        <div role="listbox" style={{ position: "absolute", zIndex: 10, top: "100%", left: 0, right: 0, marginTop: 4, background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 8, maxHeight: 300, overflowY: "auto" }}>
          {results.map((t) => (
            <button key={t.address} role="option" aria-selected={t.address === value.address} className="pick" onClick={() => pick(t)}>
              <span>
                {t.symbol}{t.riskFlagged && <span className="dn" style={{ fontSize: 12 }}> flagged</span>}
                {t.name && t.name !== t.symbol && <span className="mut" style={{ fontSize: 12 }}> {t.name}</span>}
              </span>
              {t.price && <span className="m mut" style={{ fontSize: 12 }}>{usd(Number(t.price))}{t.liquidity ? ` · ${compact(Number(t.liquidity))} liq` : ""}</span>}
            </button>
          ))}
          {pasted && <button className="pick" onClick={() => pick({ symbol: `${query.trim().slice(0, 6)}…`, address: query.trim(), riskFlagged: true })}>Use this address <span className="dn" style={{ fontSize: 12 }}>unverified</span></button>}
          {!results.length && !pasted && <p className="mut" style={{ margin: 0, padding: "10px 12px" }}>{unavailable ? "Search is unavailable. Paste a token address." : "No tokens found."}</p>}
        </div>
      )}
    </div>
  );
}
