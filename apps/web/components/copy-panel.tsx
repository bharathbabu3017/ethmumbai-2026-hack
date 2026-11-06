"use client";

import { prepareOrder, submitPrepared, USDC_BASE, type OrderRequest, type QuoteResponse } from "@flashmob/flash";
import Link from "next/link";
import { useState } from "react";
import { ensureSession, postJson } from "@/lib/account";
import { copyInputError, copyMode, entryPrice, tradeBlock, type CopyableTrade } from "@/lib/copy";
import { flash } from "@/lib/flash";
import { usd } from "@/lib/format";
import { useWallet } from "@/lib/wallet";

const PRESETS = ["25", "50", "100", "250"];
type Preview = { request: OrderRequest; quote: QuoteResponse; price: number };

export function CopyPanel({ trade }: { trade: CopyableTrade & { id: string; tokenSymbol: string; tokenAddress: string } }) {
  const { address, login, getSigner } = useWallet();
  const [amount, setAmount] = useState("25");
  const [stop, setStop] = useState(trade.stopPrice === null ? "" : String(trade.stopPrice));
  const [target, setTarget] = useState(trade.targetPrice === null ? "" : String(trade.targetPrice));
  const [preview, setPreview] = useState<Preview>();
  const [placed, setPlaced] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const mode = copyMode(trade);
  const entry = entryPrice(trade);
  const levels = { stopPrice: stop === "" ? null : Number(stop), targetPrice: target === "" ? null : Number(target) };

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
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const review = run(async () => {
    if (!address) throw new Error("Connect a wallet first");
    const pair = { targetChain: "base", contraChain: "base", targetAsset: trade.tokenAddress, contraAsset: USDC_BASE, side: "buy", qty: amount } as const;
    const probe = await flash.quote({ ...pair, orderType: "market" });
    const price = Number(probe.from.notional) / Number(probe.to.amount);
    // The server rechecks this, including whether the trader still holds the position.
    const problem = tradeBlock(trade, price, true) ?? copyInputError(trade, price, { amountUsd: Number(amount), ...levels });
    if (problem) throw new Error(problem);
    const request: OrderRequest = {
      ...pair,
      orderType: mode,
      // Flash rejects limitNotionalPrice on a limit entry with a bracket. Against USDC the pair rate is the USD price.
      ...(mode === "limit" ? (stop ? { limitCrossPrice: String(trade.limitPrice) } : { limitNotionalPrice: String(trade.limitPrice) }) : {}),
      ...(stop ? { attachedBracket: { takeProfit: { notionalPrice: target }, stopLoss: { notionalPrice: stop } } } : {}),
    };
    setPreview({ request, quote: await prepareOrder(flash, address, request), price });
  });

  const confirm = run(async () => {
    if (!preview) return;
    await ensureSession(getSigner);
    const { copyId } = await postJson<{ copyId: string }>(`/api/trades/${trade.id}/copies`, { amountUsd: amount, ...levels });
    let orderId: string;
    try {
      ({ orderId } = await submitPrepared(flash, await getSigner(), preview.request, preview.quote));
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
      <h2 style={{ fontSize: 18 }}>Copy this trade</h2>
      <p className="mut" style={{ margin: 0 }}>{mode === "limit" ? `Limit order at ${usd(trade.limitPrice)}. It fills if the price gets there.` : "Market order at the current price."}</p>
      <div>
        <label className="lab" htmlFor="amount">Amount (USDC)</label>
        <input id="amount" className="inp" inputMode="decimal" value={amount} onChange={edit(setAmount)} />
        <div className="row" style={{ flexWrap: "nowrap", gap: 6, marginTop: 8 }}>
          {PRESETS.map((p) => (
            <button key={p} className={`btn ${amount === p ? "on" : ""}`} style={{ flex: "1 1 0", padding: 0, minHeight: 36 }} onClick={() => { setAmount(p); setPreview(undefined); }}>${p}</button>
          ))}
        </div>
      </div>
      <div className="row" style={{ flexWrap: "nowrap" }}>
        <div style={{ flex: "1 1 0", minWidth: 0 }}><label className="lab" htmlFor="stop">Stop loss (USD)</label><input id="stop" className="inp" inputMode="decimal" value={stop} onChange={edit(setStop)} /></div>
        <div style={{ flex: "1 1 0", minWidth: 0 }}><label className="lab" htmlFor="target">Take profit (USD)</label><input id="target" className="inp" inputMode="decimal" value={target} onChange={edit(setTarget)} /></div>
      </div>

      {!stop && !target && <p className="dn" style={{ margin: 0, fontSize: 13 }}>No stop or target set. You&apos;ll have to exit this position yourself.</p>}

      {preview && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "12px 0", borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)" }}>
          <div className="between"><span className="mut">Price now</span><span className="m">{usd(preview.price)}</span></div>
          {entry !== null && <div className="between"><span className="mut">Trader&apos;s entry</span><span className="m">{usd(entry)}</span></div>}
          <div className="between"><span className="mut">You get about</span><span className="m">{Number(preview.quote.to.amount).toFixed(6)} {trade.tokenSymbol}</span></div>
          <div className="between"><span className="mut">Estimated fees</span><span className="m">${preview.quote.fees.estimatedFeeNotional}</span></div>
          {preview.quote.recommendedSlippage && <div className="between"><span className="mut">Max slippage</span><span className="m">{(Number(preview.quote.recommendedSlippage) * 100).toFixed(1)}%</span></div>}
          <p className="mut" style={{ margin: "6px 0 0", fontSize: 13 }}>This spends real funds. Your wallet may ask you to approve tokens and sign more than once. Keep the tokens in your wallet so any stop and target can execute.</p>
        </div>
      )}

      {!address
        ? <button className="btn pri" onClick={login}>Connect a wallet to copy</button>
        : preview
          ? <button className="btn pri" disabled={busy} onClick={confirm}>{busy ? "Check your wallet" : "Confirm in wallet"}</button>
          : <button className="btn pri" disabled={busy} onClick={review}>{busy ? "Getting quote" : "Review copy"}</button>}
      {error && <p role="alert" className="dn" style={{ margin: 0 }}>{error}</p>}
    </div>
  );
}
