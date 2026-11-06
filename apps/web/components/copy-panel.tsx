"use client";

import { buildOrder, HIGH_COST_PERCENT, orderCost, prepareOrder, USDC_BASE, type OrderRequest, type QuoteResponse, type TradeForm } from "@flashmob/flash";
import Link from "next/link";
import { useState } from "react";
import { LevelInput } from "@/components/level-input";
import { ensureSession, postJson } from "@/lib/account";
import { canAttach, copyForm, copyInputError, copySummary, entryPrice, tradeBlock, type CopyableTrade } from "@flashmob/flash";
import { flash } from "@/lib/flash";
import { plainError, usd } from "@/lib/format";
import { useWallet } from "@/lib/wallet";

const PRESETS = ["1", "2", "5", "10"];
type Preview = { request: OrderRequest; quote: QuoteResponse; price: number };

export function CopyPanel({ trade, inDrawer }: { trade: CopyableTrade & { id: string; tokenSymbol: string; tokenAddress: string }; inDrawer?: boolean }) {
  const { address, ready, login, getSigner, actions } = useWallet();
  const [amount, setAmount] = useState("1");
  const [stop, setStop] = useState(trade.stopPrice === null ? "" : String(trade.stopPrice));
  const [target, setTarget] = useState(trade.targetPrice === null ? "" : String(trade.targetPrice));
  const [preview, setPreview] = useState<Preview>();
  const [placed, setPlaced] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const cost = preview ? orderCost(preview.quote) : null;
  const attachable = canAttach(trade);
  const entry = entryPrice(trade);
  const levels = { stopPrice: !attachable || stop === "" ? null : Number(stop), targetPrice: !attachable || target === "" ? null : Number(target) };

  const edit = (set: (v: string) => void) => (e: { target: { value: string } }) => {
    set(e.target.value);
    setPreview(undefined);
  };

  const run = (fn: () => Promise<void>) => async () => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(plainError(e));
    } finally {
      setBusy(false);
    }
  };

  const review = run(async () => {
    if (!address) throw new Error("Connect a wallet first");
    const probe = await flash.quote({ targetChain: "base", contraChain: "base", targetAsset: trade.tokenAddress, contraAsset: USDC_BASE, side: "buy", qty: amount, orderType: "market" });
    const price = Number(probe.from.notional) / Number(probe.to.amount);
    // The server rechecks this, including whether the trader still holds the position.
    const problem = tradeBlock(trade, price, true) ?? copyInputError(trade, price, { amountUsd: Number(amount), ...levels });
    if (problem) throw new Error(problem);
    const built = buildOrder({ ...copyForm(trade, { qty: amount, stop, target }), tokenAddress: trade.tokenAddress, funder: address } as TradeForm);
    if ("error" in built) throw new Error(built.error);
    const { request } = built;
    setPreview({ request, quote: await prepareOrder(flash, address, request), price });
  });

  const confirm = run(async () => {
    if (!preview) return;
    await ensureSession(getSigner);
    const { copyId } = await postJson<{ copyId: string }>(`/api/trades/${trade.id}/copies`, { amountUsd: amount, ...levels });
    let orderId: string;
    try {
      ({ orderId } = await actions.place(preview.request, preview.quote));
    } catch (e) {
      // Only a declined signature is certain to have placed nothing. Otherwise the reservation stays and blocks a duplicate.
      const declined = e instanceof Error && /reject|denied|cancel/i.test(e.message);
      if (declined) await fetch(`/api/copies/${copyId}`, { method: "DELETE" });
      throw new Error(declined ? "You declined in your wallet. Nothing was placed." : "We couldn't confirm the order. Check Portfolio before trying again.");
    }
    await postJson(`/api/copies/${copyId}/confirm`, { orderId }).catch(() => {
      throw new Error(`Your order was placed (${orderId}), but we couldn't record the copy yet. Don't copy again. Check Portfolio.`);
    });
    setPlaced(true);
  });

  if (placed) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <h2 style={{ fontSize: 18 }}>Copy placed</h2>
        <p className="mut" style={{ margin: 0 }}>Your order is live. Keep the tokens in your wallet so any stop and target can execute.</p>
        <Link href="/portfolio" className="btn">View my orders</Link>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {!inDrawer && <h2 style={{ fontSize: 18 }}>Copy this trade</h2>}
      <p className="mut" style={{ margin: 0 }}>{copySummary(trade)}</p>
      <div>
        <label className="lab" htmlFor="amount">Amount (USDC)</label>
        <input id="amount" className="inp" inputMode="decimal" value={amount} onChange={edit(setAmount)} />
        <div className="row" style={{ flexWrap: "nowrap", gap: 6, marginTop: 8 }}>
          {PRESETS.map((p) => (
            <button key={p} className={`btn ${amount === p ? "on" : ""}`} style={{ flex: "1 1 0", padding: 0, minHeight: 36 }} onClick={() => { setAmount(p); setPreview(undefined); }}>${p}</button>
          ))}
        </div>
      </div>
      {attachable && <div className="row" style={{ flexWrap: "nowrap" }}>
          <LevelInput id="copy-stop" label="Stop loss" direction="below" reference={entry} value={stop} onChange={(v) => { setStop(v); setPreview(undefined); }} />
          <LevelInput id="copy-target" label="Take profit" direction="above" reference={entry} value={target} onChange={(v) => { setTarget(v); setPreview(undefined); }} />
      </div>}

      {(!attachable || (!stop && !target)) && <p className="dn" style={{ margin: 0, fontSize: 13 }}>No stop or target set. You&apos;ll have to exit this position yourself.</p>}

      {preview && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "12px 0", borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)" }}>
          <div className="between"><span className="mut">Price now</span><span className="m">{usd(preview.price)}</span></div>
          {entry !== null && <div className="between"><span className="mut">Trader&apos;s entry</span><span className="m">{usd(entry)}</span></div>}
          <div className="between"><span className="mut">You get about</span><span className="m">{Number(preview.quote.to.amount).toFixed(6)} {trade.tokenSymbol}</span></div>
          {cost ? <div className="between"><span className="mut">Total cost</span><span className={`m ${cost.percent >= HIGH_COST_PERCENT ? "dn" : ""}`}>${cost.usd.toFixed(2)} ({cost.percent.toFixed(1)}%)</span></div> : null}
          {cost && cost.percent >= HIGH_COST_PERCENT && <p role="alert" className="dn" style={{ margin: "6px 0 0", fontSize: 13 }}>This order loses about {cost.percent.toFixed(0)}% to trading costs. Costs are mostly fixed per order, so a larger amount loses a smaller share.</p>}
          {preview.quote.recommendedSlippage && <div className="between"><span className="mut">Max slippage</span><span className="m">{(Number(preview.quote.recommendedSlippage) * 100).toFixed(1)}%</span></div>}
          <p className="mut" style={{ margin: "6px 0 0", fontSize: 13 }}>This spends real funds. Your wallet may ask you to approve tokens and sign more than once. Keep the tokens in your wallet so any stop and target can execute.</p>
        </div>
      )}

      {!ready
        ? <div className="sk" style={{ height: 44 }} />
        : !address
        ? <button className="btn pri" onClick={login}>Connect a wallet to copy</button>
        : preview
          ? <button className="btn pri" disabled={busy} onClick={confirm}>{busy ? <><span className="spin" />Check your wallet</> : "Copy this trade"}</button>
          : <button className="btn pri" disabled={busy} onClick={review}>{busy ? <><span className="spin" />Getting a quote</> : "Review copy"}</button>}
      {error && <p role="alert" className="dn" style={{ margin: 0 }}>{error}</p>}
    </div>
  );
}
