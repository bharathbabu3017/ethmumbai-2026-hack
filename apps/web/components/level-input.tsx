"use client";

import { useEffect, useRef, useState } from "react";
import { usd } from "@/lib/format";

interface Props {
  id: string;
  label: string;
  /** A stop sits below the price and a target above it. */
  direction: "below" | "above";
  /** The price a percentage is measured from. */
  reference: number | null;
  value: string;
  onChange(price: string): void;
}

/** A stop or target, typed as a percentage or a price. The order always carries a fixed price. */
export function LevelInput({ id, label, direction, reference, value, onChange }: Props) {
  const [mode, setMode] = useState<"percent" | "price">("percent");
  const [percent, setPercent] = useState("");
  const typing = useRef(false);
  const usePercent = mode === "percent" && !!reference;

  // Clears after an order is placed, but not when typing "0" on the way to "0.5".
  useEffect(() => {
    if (value === "" && !typing.current) setPercent("");
    typing.current = false;
  }, [value]);

  const fromPercent = (text: string) => {
    setPercent(text);
    const p = Number(text);
    if (!text || !p || !reference) {
      typing.current = !!text && value !== "";
      return onChange("");
    }
    onChange(String(Number((reference * (direction === "below" ? 1 - p / 100 : 1 + p / 100)).toPrecision(6))));
  };

  const toggle = () => {
    setPercent("");
    onChange("");
    setMode(usePercent ? "price" : "percent");
  };

  return (
    <div style={{ flex: "1 1 0", minWidth: 0 }}>
      <div className="between" style={{ alignItems: "center", marginBottom: 6 }}>
        <label className="lab" htmlFor={id} style={{ margin: 0 }}>{label}</label>
        {reference && <button type="button" className="unit" aria-label={usePercent ? "Enter a price instead" : "Enter a percentage instead"} onClick={toggle}>{usePercent ? "%" : "$"}</button>}
      </div>
      {usePercent
        ? <input id={id} className="inp" inputMode="decimal" placeholder={`% ${direction}`} value={percent} onChange={(e) => fromPercent(e.target.value)} />
        : <input id={id} className="inp" inputMode="decimal" placeholder="Optional" value={value} onChange={(e) => onChange(e.target.value)} />}
      <div className="mut m" style={{ fontSize: 12, minHeight: 18, marginTop: 4 }}>{usePercent && value ? usd(Number(value)) : ""}</div>
    </div>
  );
}
