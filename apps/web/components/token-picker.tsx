"use client";

import { BASE_TOKENS } from "@flashmob/flash";
import { useEffect, useRef, useState } from "react";
import type { AssetChoice } from "@/components/asset-chooser";
import { TokenIcon } from "@/components/token-icon";
import { useCached } from "@/lib/cached";
import { flash } from "@/lib/flash";
import { pct, usd } from "@/lib/format";

export interface PickedToken {
  symbol: string;
  address: string;
  riskFlagged: boolean;
  imageUrl?: string | null;
}

type Result = PickedToken & { name?: string; price?: string; priceChange24h?: string; liquidity?: string; volume24h?: string; marketCap?: string; holders?: number | null };

const RECENT_KEY = "flashmob-recent-tokens";
const RECENT_MAX = 5;
const COLUMNS = "minmax(190px,1.5fr) 140px 70px 90px 90px 80px 70px";

const compact = (n: number) => Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
const money = (v?: string) => (Number(v) > 0 ? `$${compact(Number(v))}` : "-");

function readRecent(): PickedToken[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function saveRecent(token: PickedToken) {
  try {
    const rest = readRecent().filter((t) => t.address.toLowerCase() !== token.address.toLowerCase());
    localStorage.setItem(RECENT_KEY, JSON.stringify([token, ...rest].slice(0, RECENT_MAX)));
  } catch {
    // Recent tokens are only a shortcut, so losing them is fine.
  }
}

export function TokenSearch({ onPick, onClose, quick, onQuick }: { onPick(token: PickedToken): void; onClose(): void; quick?: AssetChoice[]; onQuick?(choice: AssetChoice): void }) {
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Result[]>();
  const [searching, setSearching] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [active, setActive] = useState(0);
  const [recent] = useState(readRecent);
  const input = useRef<HTMLInputElement>(null);
  const { data: popular } = useCached<Result[]>("popular-tokens", () => fetch("/api/tokens").then((r) => r.json()).then((r) => r.assets));

  useEffect(() => input.current?.focus(), []);

  useEffect(() => {
    const q = query.trim();
    setActive(0);
    if (!q) {
      setFound(undefined);
      setSearching(false);
      return;
    }
    let stale = false;
    setSearching(true);
    const timer = setTimeout(() => {
      flash.search(q, { chain: "base", limit: 15 })
        .then(({ assets }) => {
          if (stale) return;
          setUnavailable(false);
          setFound(assets);
        })
        .catch(() => {
          if (stale) return;
          setUnavailable(true);
          setFound(BASE_TOKENS.filter((t) => t.symbol.toLowerCase().includes(q.toLowerCase())));
        })
        .finally(() => {
          if (!stale) setSearching(false);
        });
    }, 250);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [query]);

  const rows: Result[] = found ?? popular ?? BASE_TOKENS;
  const pasted = /^0x[0-9a-fA-F]{40}$/.test(query.trim()) && !rows.some((r) => r.address.toLowerCase() === query.trim().toLowerCase());

  const keys = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, rows.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    if (e.key === "Enter" && rows[active]) onPick(rows[active]!);
  };

  return (
    <>
      <div className="drawer-back" onClick={onClose} aria-hidden="true" />
      <div className="palette" role="dialog" aria-modal="true" aria-label="Search tokens" onKeyDown={keys}>
        <div style={{ padding: 12 }}>
          <input ref={input} className="inp" aria-label="Search by name, symbol or address" placeholder="Search by name, symbol or address" autoComplete="off" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {!query && quick && (
          <div style={{ padding: "0 12px 10px" }}>
            <div className="mut" style={{ fontSize: 12, marginBottom: 6 }}>Your wallet and USDC</div>
            <div className="row" style={{ gap: 6 }}>
              {quick.map((c) => <button key={c.key} className="asset" onClick={() => onQuick?.(c)}><TokenIcon token={c} size={18} />{c.symbol}{c.note && <span className="mut" style={{ fontSize: 12 }}>{c.note}</span>}</button>)}
            </div>
          </div>
        )}
        {!query && recent.length > 0 && (
          <div className="row" style={{ gap: 6, padding: "0 12px 10px" }}>
            <span className="mut" style={{ fontSize: 12 }}>Recent</span>
            {recent.map((t) => <button key={t.address} className="chip" style={{ minHeight: 36, gap: 6 }} onClick={() => onPick(t)}><TokenIcon token={t} size={18} />{t.symbol}</button>)}
          </div>
        )}
        <div style={{ overflow: "auto", flex: "1 1 auto" }}>
          <div className="tr-token head" style={{ gridTemplateColumns: COLUMNS }}><span>{query ? "Results on Base" : "Popular on Base"}</span><span>Price</span><span>24h</span><span>Market cap</span><span>Liquidity</span><span>Volume</span><span>Holders</span></div>
          {rows.map((t, i) => {
            const change = Number(t.priceChange24h ?? 0) * 100;
            return (
              <button key={t.address} className={`tr-token ${i === active ? "active" : ""}`} style={{ gridTemplateColumns: COLUMNS }} onMouseEnter={() => setActive(i)} onClick={() => onPick(t)}>
                <span className="row" style={{ gap: 10, flexWrap: "nowrap", minWidth: 0 }}>
                  <TokenIcon token={t} />
                  <span style={{ minWidth: 0 }}>
                    <span className="row" style={{ gap: 6, flexWrap: "nowrap", fontWeight: 600 }}>{t.symbol}{t.riskFlagged && <span className="dn" style={{ fontSize: 11, fontWeight: 500 }}>Risky</span>}</span>
                    <span className="mut" style={{ display: "block", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name ?? `${t.address.slice(0, 6)}…${t.address.slice(-4)}`}</span>
                  </span>
                </span>
                <span className="m">{Number(t.price) > 0 ? usd(Number(t.price)) : "-"}</span>
                {!change ? <span className="m mut">-</span> : <span className={`m ${change < 0 ? "dn" : "up"}`}>{pct(change)}</span>}
                <span className="m">{money(t.marketCap)}</span>
                <span className="m">{money(t.liquidity)}</span>
                <span className="m">{money(t.volume24h)}</span>
                <span className="m">{t.holders ? compact(t.holders) : "-"}</span>
              </button>
            );
          })}
          {pasted && <button className="tr-token" style={{ gridTemplateColumns: "1fr" }} onClick={() => onPick({ symbol: `${query.trim().slice(0, 6)}…`, address: query.trim(), riskFlagged: true })}>Use this address <span className="dn" style={{ fontSize: 12 }}>unverified</span></button>}
          {!rows.length && !pasted && !searching && <p className="mut" style={{ margin: 0, padding: 16 }}>{unavailable ? "Search is unavailable right now. Paste a token address instead." : "No tokens found on Base."}</p>}
        </div>
        <div className="mut" style={{ fontSize: 12, padding: "8px 12px", borderTop: "1px solid var(--line)" }}>{searching ? "Searching…" : "Use ↑ and ↓ to move, Enter to pick, Esc to close"}</div>
      </div>
    </>
  );
}

export function TokenPicker({ value, onChange, bar }: { value: PickedToken; onChange(token: PickedToken): void; bar?: boolean }) {
  const [open, setOpen] = useState(false);

  // The search bar also opens with "/", as on most trading sites, unless you're typing somewhere.
  useEffect(() => {
    if (!bar) return;
    const shortcut = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && e.target.closest("input, textarea, select");
      if (e.key === "/" && !typing) {
        e.preventDefault();
        setOpen(true);
      }
    };
    document.addEventListener("keydown", shortcut);
    return () => document.removeEventListener("keydown", shortcut);
  }, [bar]);

  const pick = (t: PickedToken) => {
    const token = { symbol: t.symbol, address: t.address, riskFlagged: t.riskFlagged, imageUrl: t.imageUrl };
    saveRecent(token);
    onChange(token);
    setOpen(false);
  };

  if (bar) {
    return (
      <>
        <button className="search-bar" aria-label="Search tokens" onClick={() => setOpen(true)}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
          Search tokens
          <kbd>/</kbd>
        </button>
        {open && <TokenSearch onPick={pick} onClose={() => setOpen(false)} />}
      </>
    );
  }

  return (
    <>
      <button className="btn" aria-label={`${value.symbol}. Search tokens`} style={{ gap: 8, fontSize: 16, fontWeight: 600 }} onClick={() => setOpen(true)}>
        <TokenIcon token={value} size={22} />{value.symbol}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {open && <TokenSearch onPick={pick} onClose={() => setOpen(false)} />}
    </>
  );
}
