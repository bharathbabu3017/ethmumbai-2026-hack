"use client";

import { useState } from "react";
import { TokenIcon } from "@/components/token-icon";
import { saveRecent, TokenSearch, type PickedToken } from "@/components/token-picker";

export interface AssetChoice {
  key: string;
  address: string;
  symbol: string;
  /** A balance or network, shown beside the symbol. */
  note?: string;
  /** Only offered under More, such as USDC on another chain. */
  moreOnly?: boolean;
}

const CHIPS = 4;

/** Quick picks for the usual tokens, with More for search. */
export function AssetChooser({ label, choices, selected, onPick }: { label: string; choices: AssetChoice[]; selected: AssetChoice; onPick(choice: AssetChoice): void }) {
  const [more, setMore] = useState(false);
  const chips = choices.filter((c) => !c.moreOnly).slice(0, CHIPS);
  const shown = chips.some((c) => c.key === selected.key) ? chips : [...chips.slice(0, CHIPS - 1), selected];

  const choose = (choice: AssetChoice) => {
    setMore(false);
    onPick(choice);
  };
  const fromSearch = (t: PickedToken) => {
    saveRecent(t);
    choose({ key: t.address, address: t.address, symbol: t.symbol });
  };

  return (
    <div>
      <span className="lab">{label}</span>
      <div className="row" style={{ gap: 6 }}>
        {shown.map((c) => (
          <button key={c.key} className={`asset ${c.key === selected.key ? "sel" : ""}`} aria-pressed={c.key === selected.key} onClick={() => choose(c)}>
            <TokenIcon token={c} size={18} />{c.symbol}
          </button>
        ))}
        <button className="asset" onClick={() => setMore(true)}>More</button>
      </div>
      {selected.note && <div className="mut" style={{ fontSize: 12, marginTop: 6 }}>{selected.note}</div>}
      {more && <TokenSearch quick={choices} onQuick={choose} onPick={fromSearch} onClose={() => setMore(false)} />}
    </div>
  );
}
