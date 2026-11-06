"use client";

import { DEFAULT_COPY_SETTINGS, type CopyExits, type CopySettings, type CopySizing } from "@flashmob/flash";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ensureSession, postJson } from "@/lib/account";
import { WalletAddress } from "@/components/wallet-address";
import { plainError } from "@/lib/format";
import { useWallet } from "@/lib/wallet";

type Form = Record<Exclude<keyof CopySettings, "enabled" | "sizing" | "exits" | "autoSell" | "skipRiskyTokens">, string>;

const toForm = (s: CopySettings): Form => ({
  amountUsd: String(s.amountUsd),
  percentOfBalance: String(s.percentOfBalance),
  maxPerTradeUsd: String(s.maxPerTradeUsd),
  dailyCapUsd: String(s.dailyCapUsd),
  stopPercent: s.stopPercent?.toString() ?? "",
  targetPercent: s.targetPercent?.toString() ?? "",
  maxSlippagePercent: s.maxSlippagePercent?.toString() ?? "",
  maxEntryDriftPercent: String(s.maxEntryDriftPercent),
  blockedTokens: s.blockedTokens.join(", "),
});

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

export function CopySettingsPanel({ traderId, name }: { traderId: string; name: string }) {
  const { address, login, getSigner, approveServerAccess } = useWallet();
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [sizing, setSizing] = useState<CopySizing>("fixed");
  const [exits, setExits] = useState<CopyExits>("trader");
  const [autoSell, setAutoSell] = useState(false);
  const [skipRisky, setSkipRisky] = useState(true);
  const [form, setForm] = useState<Form>(toForm(DEFAULT_COPY_SETTINGS));
  const [live, setLive] = useState(false);
  const [tradingWallet, setTradingWallet] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!address) return;
    fetch(`/api/copy-settings/${traderId}`).then(async (r) => {
      if (!r.ok) return setLoaded(true);
      const { settings: s, tradingWallet: approved, autoCopyLive } = await r.json();
      setEnabled(s.enabled); setSizing(s.sizing); setExits(s.exits); setAutoSell(s.autoSell); setSkipRisky(s.skipRiskyTokens);
      setForm(toForm(s)); setTradingWallet(approved); setLive(autoCopyLive); setLoaded(true);
    }).catch(() => setLoaded(true));
  }, [address, traderId]);
  useEffect(load, [load]);

  const approve = async () => {
    setApproving(true);
    setStatus("");
    try {
      await approveServerAccess?.();
      load();
    } catch (e) {
      setStatus(plainError(e));
    } finally {
      setApproving(false);
    }
  };

  const field = (key: keyof Form, id = key) => ({
    id, className: "inp", inputMode: "decimal" as const, value: form[key],
    onChange: (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value }),
  });

  const save = async () => {
    setBusy(true);
    setStatus("");
    try {
      await ensureSession(getSigner);
      await postJson(`/api/copy-settings/${traderId}`, {
        ...form, enabled, sizing, exits, autoSell, skipRiskyTokens: skipRisky, blockedTokens: form.blockedTokens.split(","),
      });
      setStatus(enabled ? (live ? `Auto-copy is on for ${name}.` : "Saved. Auto-copy isn't switched on for Flashmob yet, so nothing will trade.") : "Saved.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  if (!address) return <button className="btn" onClick={login}>Connect to set up auto-copy</button>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <button className="btn" onClick={() => setOpen(!open)}>{enabled && loaded ? "Auto-copy settings (on)" : "Auto-copy settings"}</button>
      {open && (
        <>
          {!tradingWallet && (
            <div className="panel" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
              <strong>Approve auto-copy</strong>
              <span className="mut" style={{ fontSize: 13 }}>This lets Flashmob place trades from your Flashmob wallet while you&apos;re away, within your limits. Flashmob never sees its key.</span>
              <button className="btn pri" disabled={approving || !approveServerAccess} onClick={approve}>{approving ? <><span className="spin" />Approving</> : "Approve"}</button>
            </div>
          )}
          {tradingWallet && (
            <div>
              <div className="lab">Auto-copy trades from this wallet. Fund it with USDC and a little ETH on Base.</div>
              <WalletAddress address={tradingWallet} />
            </div>
          )}
          {!live && <p className="mut" style={{ margin: 0, fontSize: 13 }}>Auto-copy isn&apos;t switched on for Flashmob yet. You can save your settings now.</p>}
          <Toggle label="Copy automatically" hint={`Every buy ${name} makes is copied from your Flashmob wallet.`} on={enabled} onChange={setEnabled} />

          <div>
            <label className="lab" htmlFor="sizing">Size each copy by</label>
            <select id="sizing" className="inp" value={sizing} onChange={(e) => setSizing(e.target.value as CopySizing)}>
              <option value="fixed">Fixed amount</option>
              <option value="percent">Percent of my USDC balance</option>
            </select>
          </div>
          {sizing === "fixed" ? (
            <Field id="amountUsd" label="Amount per trade (USD)"><input {...field("amountUsd")} /></Field>
          ) : (
            <div className="row" style={{ flexWrap: "nowrap" }}>
              <Field id="percentOfBalance" label="Percent of balance"><input {...field("percentOfBalance")} /></Field>
              <Field id="maxPerTradeUsd" label="Max per trade (USD)"><input {...field("maxPerTradeUsd")} /></Field>
            </div>
          )}
          <Field id="dailyCapUsd" label="Daily limit (USD)"><input {...field("dailyCapUsd")} /></Field>

          <div>
            <label className="lab" htmlFor="exits">Stop loss and take profit</label>
            <select id="exits" className="inp" value={exits} onChange={(e) => setExits(e.target.value as CopyExits)}>
              <option value="trader">Use the trader&apos;s</option>
              <option value="custom">Use my own percentages</option>
              <option value="none">None</option>
            </select>
          </div>
          {exits === "custom" && (
            <div className="row" style={{ flexWrap: "nowrap" }}>
              <Field id="stopPercent" label="Stop loss (% below)"><input {...field("stopPercent")} /></Field>
              <Field id="targetPercent" label="Take profit (% above)"><input {...field("targetPercent")} /></Field>
            </div>
          )}

          <div className="row" style={{ flexWrap: "nowrap" }}>
            <Field id="maxEntryDriftPercent" label="Skip if price moved (%)"><input {...field("maxEntryDriftPercent")} /></Field>
            <Field id="maxSlippagePercent" label="Max slippage (%)"><input {...field("maxSlippagePercent")} placeholder="Flash default" /></Field>
          </div>
          <Field id="blockedTokens" label="Never copy these tokens"><input {...field("blockedTokens")} inputMode="text" placeholder="DEGEN, BRETT" /></Field>

          <Toggle label="Skip risky tokens" hint="Skips tokens that are flagged, or that we can't verify." on={skipRisky} onChange={setSkipRisky} />
          <Toggle label="Sell automatically" hint="When they sell, sell the same share of your copy. Off means you get a prompt." on={autoSell} onChange={setAutoSell} />

          <button className="btn pri" disabled={busy} onClick={save}>{busy ? "Saving" : "Save settings"}</button>
          {status && <p role="status" style={{ margin: 0, fontSize: 13 }}>{status}</p>}
        </>
      )}
    </div>
  );
}
