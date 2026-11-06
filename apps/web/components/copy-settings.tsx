"use client";

import { DEFAULT_COPY_SETTINGS, type CopyExits, type CopySettings, type CopySizing } from "@flashmob/flash";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { WalletAddress } from "@/components/wallet-address";
import { ensureSession, postJson } from "@/lib/account";
import { copyStatus } from "@/lib/copy-status";
import { plainError } from "@/lib/format";
import { useWallet } from "@/lib/wallet";

interface Status {
  settings: CopySettings;
  tradingWallet: string | null;
  usdc: number;
  eth: number;
  spent: number;
  paused: boolean;
  masterOn: boolean;
}

function Toggle({ label, hint, on, onChange }: { label: string; hint: string; on: boolean; onChange(v: boolean): void }) {
  return (
    <label className="row" style={{ flexWrap: "nowrap", alignItems: "flex-start", cursor: "pointer", gap: 10 }}>
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} style={{ marginTop: 3, accentColor: "var(--lime)" }} />
      <span><span style={{ display: "block", fontWeight: 500 }}>{label}</span><span className="mut" style={{ fontSize: 13 }}>{hint}</span></span>
    </label>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return <div style={{ flex: "1 1 0", minWidth: 0 }}><label className="lab" htmlFor={id}>{label}</label>{children}</div>;
}

const TONES = { on: "var(--up)", warn: "var(--orange)", off: "var(--mut)" };

export function CopySettingsPanel({ traderId, name }: { traderId: string; name: string }) {
  const { address, login, getSigner, approveServerAccess } = useWallet();
  const [status, setStatus] = useState<Status>();
  const [s, setS] = useState<CopySettings>(DEFAULT_COPY_SETTINGS);
  const [blocked, setBlocked] = useState("");
  const [editing, setEditing] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/copy-settings/${traderId}`);
    if (!res.ok) return;
    const next: Status = await res.json();
    setStatus(next);
    setS(next.settings);
    setBlocked(next.settings.blockedTokens.join(", "));
  }, [traderId]);

  useEffect(() => {
    if (address) load().catch(() => {});
  }, [address, load]);

  const save = async (enabled: boolean, label: string) => {
    setBusy(label);
    setError("");
    try {
      await ensureSession(getSigner);
      // Starting needs the wallet approved first, so that's folded into the same tap.
      if (enabled && !status?.tradingWallet) await approveServerAccess?.();
      await postJson(`/api/copy-settings/${traderId}`, { ...s, enabled, blockedTokens: blocked.split(",") });
      setEditing(false);
      await load();
    } catch (e) {
      setError(plainError(e));
    } finally {
      setBusy("");
    }
  };

  const set = <K extends keyof CopySettings>(key: K, value: CopySettings[K]) => setS({ ...s, [key]: value });
  const num = (key: "amountUsd" | "percentOfBalance" | "maxPerTradeUsd" | "dailyCapUsd" | "maxEntryDriftPercent") => ({
    id: key, className: "inp", inputMode: "decimal" as const, value: String(s[key]),
    onChange: (e: { target: { value: string } }) => set(key, e.target.value as unknown as number),
  });
  const optional = (key: "stopPercent" | "targetPercent" | "maxSlippagePercent") => ({
    id: key, className: "inp", inputMode: "decimal" as const, value: s[key]?.toString() ?? "",
    onChange: (e: { target: { value: string } }) => set(key, e.target.value as unknown as number),
  });

  if (!address) return <button className="btn pri" onClick={login}>Connect to start auto-copy</button>;
  if (!status) return <p className="mut" style={{ margin: 0 }}>Loading…</p>;

  const live = status.settings.enabled;
  const state = copyStatus({ ...status, approved: !!status.tradingWallet });
  const perTrade = status.settings.sizing === "fixed" ? `$${status.settings.amountUsd} per trade` : `${status.settings.percentOfBalance}% of balance per trade`;

  const form = (
    <>
      {s.sizing === "fixed"
        ? (
          <div className="row" style={{ flexWrap: "nowrap" }}>
            <Field id="amountUsd" label="Per trade (USD)"><input {...num("amountUsd")} /></Field>
            <Field id="dailyCapUsd" label="Daily limit (USD)"><input {...num("dailyCapUsd")} /></Field>
          </div>
        ) : <Field id="dailyCapUsd" label="Daily limit (USD)"><input {...num("dailyCapUsd")} /></Field>}

      <button style={{ all: "unset", cursor: "pointer", fontSize: 13, color: "var(--mut)" }} onClick={() => setAdvanced(!advanced)}>{advanced ? "Hide" : "More"} options</button>
      {advanced && (
        <>
          <div>
            <label className="lab" htmlFor="sizing">Size each copy by</label>
            <select id="sizing" className="inp" value={s.sizing} onChange={(e) => set("sizing", e.target.value as CopySizing)}>
              <option value="fixed">Fixed amount</option>
              <option value="percent">Percent of my USDC balance</option>
            </select>
          </div>
          {s.sizing === "percent" && (
            <div className="row" style={{ flexWrap: "nowrap" }}>
              <Field id="percentOfBalance" label="Percent of balance"><input {...num("percentOfBalance")} /></Field>
              <Field id="maxPerTradeUsd" label="Max per trade (USD)"><input {...num("maxPerTradeUsd")} /></Field>
            </div>
          )}
          <div>
            <label className="lab" htmlFor="exits">Stop loss and take profit</label>
            <select id="exits" className="inp" value={s.exits} onChange={(e) => set("exits", e.target.value as CopyExits)}>
              <option value="trader">Use the trader&apos;s</option>
              <option value="custom">Use my own percentages</option>
              <option value="none">None</option>
            </select>
          </div>
          {s.exits === "custom" && (
            <div className="row" style={{ flexWrap: "nowrap" }}>
              <Field id="stopPercent" label="Stop loss (% below)"><input {...optional("stopPercent")} /></Field>
              <Field id="targetPercent" label="Take profit (% above)"><input {...optional("targetPercent")} /></Field>
            </div>
          )}
          <div className="row" style={{ flexWrap: "nowrap" }}>
            <Field id="maxEntryDriftPercent" label="Skip if price moved (%)"><input {...num("maxEntryDriftPercent")} /></Field>
            <Field id="maxSlippagePercent" label="Max slippage (%)"><input {...optional("maxSlippagePercent")} placeholder="Default" /></Field>
          </div>
          <Field id="blockedTokens" label="Never copy these tokens"><input id="blockedTokens" className="inp" value={blocked} placeholder="DEGEN, BRETT" onChange={(e) => setBlocked(e.target.value)} /></Field>
          <Toggle label="Skip risky tokens" hint="Skips tokens that are flagged or can't be verified." on={s.skipRiskyTokens} onChange={(v) => set("skipRiskyTokens", v)} />
          <Toggle label="Sell when they sell" hint="Sells the same share of your copy. Off means you get a prompt instead." on={s.autoSell} onChange={(v) => set("autoSell", v)} />
        </>
      )}
    </>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="between" style={{ alignItems: "center" }}>
        <h2 style={{ fontSize: 16 }}>Auto-copy</h2>
        <span className="row" style={{ gap: 6, color: TONES[state.tone], fontSize: 13, fontWeight: 500 }}>
          {state.tone === "on" && <span className="pulse" aria-hidden="true" />}{state.label}
        </span>
      </div>
      <p className="mut" style={{ margin: 0 }}>{live ? state.detail : `Copy every trade ${name} makes, automatically.`}</p>

      {live && !editing && (
        <>
          <div className="m" style={{ fontSize: 13 }}>
            <div className="between"><span className="mut">Size</span><span>{perTrade}</span></div>
            <div className="between"><span className="mut">Used today</span><span>${status.spent.toFixed(2)} of ${status.settings.dailyCapUsd}</span></div>
            <div className="between"><span className="mut">Wallet balance</span><span>${status.usdc.toFixed(2)} USDC</span></div>
          </div>
          {status.tradingWallet && state.tone === "warn" && <WalletAddress address={status.tradingWallet} />}
          {!status.tradingWallet && <button className="btn pri" disabled={!!busy} onClick={() => save(true, "approve")}>{busy === "approve" ? <><span className="spin" />Approving</> : "Approve wallet"}</button>}
          <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
            <button className="btn" style={{ flex: "1 1 0" }} onClick={() => setEditing(true)}>Edit</button>
            <button className="btn warn" style={{ flex: "1 1 0" }} disabled={!!busy} onClick={() => save(false, "stop")}>{busy === "stop" ? <><span className="spin" />Stopping</> : "Stop"}</button>
          </div>
        </>
      )}

      {live && editing && (
        <>
          {form}
          <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
            <button className="btn" style={{ flex: "1 1 0" }} onClick={() => { setEditing(false); setS(status.settings); }}>Back</button>
            <button className="btn pri" style={{ flex: "1 1 0" }} disabled={!!busy} onClick={() => save(true, "save")}>{busy === "save" ? <><span className="spin" />Saving</> : "Save"}</button>
          </div>
        </>
      )}

      {!live && (
        <>
          {form}
          <button className="btn pri" disabled={!!busy} onClick={() => save(true, "start")}>{busy === "start" ? <><span className="spin" />Starting</> : "Start auto-copy"}</button>
          <p className="mut" style={{ margin: 0, fontSize: 12 }}>
            {status.tradingWallet ? `Trades come from your Flashmob wallet, which has $${status.usdc.toFixed(2)} USDC.` : "You'll approve Flashmob to trade from your Flashmob wallet, once. It never sees your key."}
          </p>
          {status.tradingWallet && status.usdc < Number(s.amountUsd) && <WalletAddress address={status.tradingWallet} />}
        </>
      )}
      {error && <p role="alert" className="dn" style={{ margin: 0, fontSize: 13 }}>{error}</p>}
    </div>
  );
}
