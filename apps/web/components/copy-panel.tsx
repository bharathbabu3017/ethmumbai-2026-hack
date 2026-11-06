"use client";

import { prepareOrder, submitPrepared, USDC_BASE, type OrderRequest, type QuoteResponse } from "@flashmob/flash";
import Link from "next/link";
import { useState } from "react";
import { ensureSession, postJson } from "@/lib/account";
import { callBlock, copyInputError, copyMode, type CopyableCall } from "@/lib/copy";
import { flash } from "@/lib/flash";
import { usd } from "@/lib/format";
import { useWallet } from "@/lib/wallet";

const PRESETS = ["25", "50", "100", "250"];
type Preview = { request: OrderRequest; quote: QuoteResponse; price: number };

export function CopyPanel({ call }: { call: CopyableCall & { id: string; tokenSymbol: string; tokenAddress: string } }) {
  const { address, login, getSigner } = useWallet();
  const [amount, setAmount] = useState("25");
  const [stop, setStop] = useState(String(call.stopPrice));
  const [target, setTarget] = useState(String(call.targetPrice));
  const [preview, setPreview] = useState<Preview>();
  const [placed, setPlaced] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const mode = copyMode(call);

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
    const pair = { targetChain: "base", contraChain: "base", targetAsset: call.tokenAddress, contraAsset: USDC_BASE, side: "buy", qty: amount } as const;
    const probe = await flash.quote({ ...pair, orderType: "market" });
    const price = Number(probe.from.notional) / Number(probe.to.amount);
    const problem = callBlock(call, price) ?? copyInputError(call, price, { amountUsd: Number(amount), stopPrice: Number(stop), targetPrice: Number(target) });
    if (problem) throw new Error(problem);
    const request: OrderRequest = {
      ...pair,
      orderType: mode,
      // Flash rejects limitNotionalPrice on a limit entry with a bracket. Against USDC the pair rate is the USD price.
      ...(mode === "limit" ? { limitCrossPrice: String(call.entryPrice) } : {}),
      attachedBracket: { takeProfit: { notionalPrice: target }, stopLoss: { notionalPrice: stop } },
    };
    setPreview({ request, quote: await prepareOrder(flash, address, request), price });
  });

  const confirm = run(async () => {
    if (!preview) return;
    await ensureSession(getSigner);
    const { copyId } = await postJson<{ copyId: string }>(`/api/calls/${call.id}/copies`, { amountUsd: amount, stopPrice: stop, targetPrice: target });
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
        <p className="mut" style={{ margin: 0 }}>Your order is live with your stop and target attached. Keep the tokens in your wallet so they can execute.</p>
        <Link href="/portfolio" className="btn">View my orders</Link>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <h2 style={{ fontSize: 18 }}>Copy this call</h2>
      <p className="mut" style={{ margin: 0 }}>{mode === "limit" ? `Limit order at ${usd(call.entryPrice)}. It fills if the price gets there.` : "Market order at the current price."}</p>
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
        <div style={{ flex: "1 1 0", minWidth: 0 }}><label className="lab" htmlFor="stop">Your stop (USD)</label><input id="stop" className="inp" inputMode="decimal" value={stop} onChange={edit(setStop)} /></div>
        <div style={{ flex: "1 1 0", minWidth: 0 }}><label className="lab" htmlFor="target">Your target (USD)</label><input id="target" className="inp" inputMode="decimal" value={target} onChange={edit(setTarget)} /></div>
      </div>

      {preview && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "12px 0", borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)" }}>
          <div className="between"><span className="mut">Price now</span><span className="m">{usd(preview.price)}</span></div>
          {call.entryPrice !== null && <div className="between"><span className="mut">Trader&apos;s entry</span><span className="m">{usd(call.entryPrice)}</span></div>}
          <div className="between"><span className="mut">You get about</span><span className="m">{Number(preview.quote.to.amount).toFixed(6)} {call.tokenSymbol}</span></div>
          <div className="between"><span className="mut">Estimated fees</span><span className="m">${preview.quote.fees.estimatedFeeNotional}</span></div>
          {preview.quote.recommendedSlippage && <div className="between"><span className="mut">Max slippage</span><span className="m">{(Number(preview.quote.recommendedSlippage) * 100).toFixed(1)}%</span></div>}
          <p className="mut" style={{ margin: "6px 0 0", fontSize: 13 }}>This spends real funds. Your wallet may ask you to approve tokens, then sign twice. Keep the tokens in your wallet so your stop and target can execute.</p>
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
