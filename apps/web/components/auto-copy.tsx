"use client";

import { copySize, DEFAULT_COPY_SETTINGS, type CopyExits, type CopySettings, type CopySizing } from "@flashmob/flash";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AddFunds } from "@/components/add-funds";
import { Drawer } from "@/components/drawer";
import { ensureSession, postJson } from "@/lib/account";
import { useCached } from "@/lib/cached";
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
  telegramLinked: boolean;
}

const AMOUNTS = [1, 2, 5, 10];
const LIMITS = [5, 20, 50, 100];
export const TONES = { on: "var(--up)", warn: "var(--orange)", off: "var(--mut)" };

function useCopyStatus(traderId: string) {
  const { address } = useWallet();
  const { data: status, refresh: load } = useCached<Status>(address ? `copy:${address}:${traderId}` : null, async () => {
    const res = await fetch(`/api/copy-settings/${traderId}`);
    return res.ok ? res.json() : undefined;
  });
  return { status, load };
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return <div style={{ flex: "1 1 0", minWidth: 0 }}><label className="lab" htmlFor={id}>{label}</label>{children}</div>;
}

function Picks({ id, label, values, value, onPick }: { id: string; label: string; values: number[]; value: number; onPick(v: number): void }) {
  return (
    <div>
      <label className="lab" htmlFor={id}>{label}</label>
      <input id={id} className="inp" inputMode="decimal" style={{ marginBottom: 8 }} value={String(value)} onChange={(e) => onPick(e.target.value as unknown as number)} />
      <div className="picks">
        {values.map((v) => <button key={v} className={`btn ${Number(value) === v ? "sel" : ""}`} onClick={() => onPick(v)}>${v}</button>)}
      </div>
    </div>
  );
}

function Toggle({ label, hint, on, onChange }: { label: string; hint: string; on: boolean; onChange(v: boolean): void }) {
  return (
    <label className="row" style={{ flexWrap: "nowrap", alignItems: "flex-start", cursor: "pointer", gap: 10 }}>
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} style={{ marginTop: 3, accentColor: "var(--lime)" }} />
      <span><span style={{ display: "block", fontWeight: 500 }}>{label}</span><span className="mut" style={{ fontSize: 13 }}>{hint}</span></span>
    </label>
  );
}

/** Everything about copying a trader, in one screen. The first start also approves the wallet. */
export function AutoCopySetup({ traderId, name, onClose, onSaved }: { traderId: string; name: string; onClose(): void; onSaved?(): void }) {
  const { getSigner, approveServerAccess } = useWallet();
  const { status, load } = useCopyStatus(traderId);
  const [s, setS] = useState<CopySettings>(DEFAULT_COPY_SETTINGS);
  const [blocked, setBlocked] = useState("");
  const [more, setMore] = useState(false);
  const [step, setStep] = useState<"form" | "approving" | "saving" | "done">("form");
  const [error, setError] = useState("");
  const touched = useRef(false);

  // A background refresh must never overwrite what you're typing.
  useEffect(() => {
    if (!status || step !== "form" || touched.current) return;
    setS(status.settings);
    setBlocked(status.settings.blockedTokens.join(", "));
  }, [status, step]);

  if (!status) return <Drawer title={`Copy ${name}`} onClose={onClose}><p className="mut" style={{ margin: 0 }}>Loading…</p></Drawer>;

  const live = status.settings.enabled;
  const set = <K extends keyof CopySettings>(key: K, value: CopySettings[K]) => {
    touched.current = true;
    setS({ ...s, [key]: value });
  };
  const text = (key: "percentOfBalance" | "maxPerTradeUsd" | "maxEntryDriftPercent") => ({
    id: key, className: "inp", inputMode: "decimal" as const, value: String(s[key]),
    onChange: (e: { target: { value: string } }) => set(key, e.target.value as unknown as number),
  });
  const optional = (key: "stopPercent" | "targetPercent" | "maxSlippagePercent") => ({
    id: key, className: "inp", inputMode: "decimal" as const, value: s[key]?.toString() ?? "",
    onChange: (e: { target: { value: string } }) => set(key, e.target.value as unknown as number),
  });

  const numbers = { ...s, amountUsd: Number(s.amountUsd), percentOfBalance: Number(s.percentOfBalance), maxPerTradeUsd: Number(s.maxPerTradeUsd), dailyCapUsd: Number(s.dailyCapUsd) };
  const next = copySize(numbers, status.usdc, status.spent);
  const perTrade = s.sizing === "fixed" ? `$${numbers.amountUsd.toFixed(2)}` : `${numbers.percentOfBalance}% of your USDC, at most $${numbers.maxPerTradeUsd}`;

  const save = async () => {
    setError("");
    try {
      await ensureSession(getSigner);
      if (!status.tradingWallet) {
        setStep("approving");
        if (!approveServerAccess) throw new Error("Wallet approval isn't set up");
        await approveServerAccess();
      }
      setStep("saving");
      await postJson(`/api/copy-settings/${traderId}`, { ...s, enabled: true, blockedTokens: blocked.split(",") });
      load();
      onSaved?.();
      if (live) onClose();
      else setStep("done");
    } catch (e) {
      setError(plainError(e));
      setStep("form");
    }
  };

  const linkTelegram = async () => {
    const { url } = await postJson<{ url: string }>("/api/telegram/link");
    window.open(url, "_blank");
  };

  if (step === "done") {
    return (
      <Drawer title="Auto-copy is on" onClose={onClose}>
        <p style={{ margin: 0 }}>{name}&apos;s next trade will be copied with {"amountUsd" in next ? `$${next.amountUsd.toFixed(2)}` : perTrade}.</p>
        {!status.telegramLinked && (
          <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <span><span style={{ display: "block", fontWeight: 500 }}>Hear about every copy</span><span className="mut" style={{ fontSize: 13 }}>Get a Telegram message each time.</span></span>
            <button className="btn" onClick={linkTelegram}>Link Telegram</button>
          </div>
        )}
        <button className="btn pri" onClick={onClose}>Done</button>
      </Drawer>
    );
  }

  if (step !== "form") {
    return (
      <Drawer title="Starting auto-copy" onClose={onClose}>
        <div className="between"><span>Approve your wallet</span>{status.tradingWallet || step === "saving" ? <span className="up">Done</span> : <span className="spin" />}</div>
        <div className="between"><span>Save your limits</span>{step === "saving" ? <span className="spin" /> : <span className="mut">Next</span>}</div>
      </Drawer>
    );
  }

  return (
    <Drawer title={`Copy ${name}`} onClose={onClose}>
      <div className="panel" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 6 }}>
        <p style={{ margin: 0 }}>When {name} buys, your wallet buys {perTrade} of the same token, up to ${numbers.dailyCapUsd} a day.</p>
        <p style={{ margin: 0 }}>{s.autoSell ? `When ${name} sells, you sell the same share of your copy.` : `When ${name} sells, you get a prompt and choose.`}</p>
      </div>

      {s.sizing === "fixed"
        ? <Picks id="amountUsd" label={`Per trade, USD (you have $${status.usdc.toFixed(2)} USDC)`} values={AMOUNTS} value={s.amountUsd} onPick={(v) => set("amountUsd", v)} />
        : <Field id="percentOfBalance" label={`Percent of your $${status.usdc.toFixed(2)} USDC`}><input {...text("percentOfBalance")} /></Field>}
      <Picks id="dailyCapUsd" label="Daily limit, USD" values={LIMITS} value={s.dailyCapUsd} onPick={(v) => set("dailyCapUsd", v)} />
      <div>
        <span className="lab">When they sell</span>
        <div className="picks" style={{ gridTemplateColumns: "repeat(2,minmax(0,1fr))" }}>
          <button className={`btn ${s.autoSell ? "sel" : ""}`} onClick={() => set("autoSell", true)}>Sell with them</button>
          <button className={`btn ${s.autoSell ? "" : "sel"}`} onClick={() => set("autoSell", false)}>Ask me first</button>
        </div>
      </div>

      {status.tradingWallet && "skip" in next && <p role="alert" className="dn" style={{ margin: 0, fontSize: 13 }}>Copies will be skipped. {next.skip}</p>}

      <button className="btn" style={{ justifyContent: "space-between" }} aria-expanded={more} onClick={() => setMore(!more)}>
        More options <span className="mut" style={{ fontSize: 12 }}>{more ? "Hide" : "Size, stops, slippage, blocked tokens"}</span>
      </button>
      {more && (
        <>
          <div>
            <label className="lab" htmlFor="sizing">Size each copy by</label>
            <select id="sizing" className="inp" value={s.sizing} onChange={(e) => set("sizing", e.target.value as CopySizing)}>
              <option value="fixed">Fixed amount</option>
              <option value="percent">Percent of my USDC balance</option>
            </select>
          </div>
          {s.sizing === "percent" && <Field id="maxPerTradeUsd" label="Max per trade (USD)"><input {...text("maxPerTradeUsd")} /></Field>}
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
            <Field id="maxEntryDriftPercent" label="Skip if price moved (%)"><input {...text("maxEntryDriftPercent")} /></Field>
            <Field id="maxSlippagePercent" label="Max slippage (%)"><input {...optional("maxSlippagePercent")} placeholder="Default" /></Field>
          </div>
          <Field id="blockedTokens" label="Never copy these tokens"><input id="blockedTokens" className="inp" value={blocked} placeholder="DEGEN, BRETT" onChange={(e) => { touched.current = true; setBlocked(e.target.value); }} /></Field>
          <Toggle label="Skip risky tokens" hint="Skips tokens that are flagged or can't be verified." on={s.skipRiskyTokens} onChange={(v) => set("skipRiskyTokens", v)} />
        </>
      )}

      <button className="btn pri" onClick={save}>{live ? "Save changes" : "Start auto-copy"}</button>
      {!status.tradingWallet && <p className="mut" style={{ margin: 0, fontSize: 12 }}>The first time, you approve Flashmob to place trades from your Flashmob wallet. We check your limits before every trade, and you can stop at any time.</p>}
      {error && <p role="alert" className="dn" style={{ margin: 0, fontSize: 13 }}>{error}</p>}
    </Drawer>
  );
}

/** The trader page's view of auto-copy: what's happening, and the one next step. */
export function AutoCopyCard({ traderId, name }: { traderId: string; name: string }) {
  const { address, ready, login, getSigner } = useWallet();
  const { status, load } = useCopyStatus(traderId);
  const [setup, setSetup] = useState(false);
  const [funds, setFunds] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!ready) return <div className="sk" style={{ height: 150 }} />;
  if (!address) return <><h2 style={{ fontSize: 16 }}>Auto-copy</h2><p className="mut" style={{ margin: 0 }}>Your wallet follows their trades within your limits.</p><button className="btn pri" onClick={login}>Connect to start</button></>;
  if (!status) return <div className="sk" style={{ height: 150 }} />;

  const state = copyStatus({ ...status, approved: !!status.tradingWallet });
  const s = status.settings;
  const live = s.enabled;

  const stop = async () => {
    setBusy(true);
    setError("");
    try {
      await ensureSession(getSigner);
      await postJson(`/api/copy-settings/${traderId}`, { ...s, enabled: false });
      load();
    } catch (e) {
      setError(plainError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="between" style={{ alignItems: "center" }}>
        <h2 style={{ fontSize: 16 }}>Auto-copy</h2>
        <span className="row" style={{ gap: 6, color: TONES[state.tone], fontSize: 13, fontWeight: 500 }}>{state.tone === "on" && <span className="pulse" aria-hidden="true" />}{state.label}</span>
      </div>
      <p className="mut" style={{ margin: 0 }}>{live ? state.detail : "Your wallet follows their trades within your limits."}</p>
      {live ? (
        <>
          <div className="m" style={{ fontSize: 13 }}>
            <div className="between"><span className="mut">Size</span><span>{s.sizing === "fixed" ? `$${s.amountUsd} per trade` : `${s.percentOfBalance}% of balance`}</span></div>
            <div className="between"><span className="mut">Used today</span><span>${status.spent.toFixed(2)} of ${s.dailyCapUsd}</span></div>
            <div className="between"><span className="mut">Wallet</span><span>${status.usdc.toFixed(2)} USDC</span></div>
          </div>
          {state.fix === "funds" && status.tradingWallet && <button className="btn pri" onClick={() => setFunds(true)}>Add funds</button>}
          <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
            <button className="btn" style={{ flex: "1 1 0" }} onClick={() => setSetup(true)}>Edit</button>
            <button className="btn warn" style={{ flex: "1 1 0" }} disabled={busy} onClick={stop}>{busy ? <><span className="spin" />Stopping</> : "Stop"}</button>
          </div>
        </>
      ) : <button className="btn pri" onClick={() => setSetup(true)}>Set up auto-copy</button>}
      {error && <p role="alert" className="dn" style={{ margin: 0, fontSize: 13 }}>{error}</p>}
      {setup && <AutoCopySetup traderId={traderId} name={name} onClose={() => setSetup(false)} onSaved={load} />}
      {funds && status.tradingWallet && <AddFunds address={status.tradingWallet} onClose={() => setFunds(false)} />}
    </>
  );
}
