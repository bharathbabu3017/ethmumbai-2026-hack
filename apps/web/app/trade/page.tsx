"use client";

import { BASE_TOKENS, prepareOrder, resolveBaseToken, submitPrepared, USDC_BASE, type OrderRequest, type QuoteResponse } from "@flashmob/flash";
import { useState } from "react";
import { Nav } from "@/components/nav";
import { PriceChart } from "@/components/price-chart";
import { flash } from "@/lib/flash";
import { useWallet } from "@/lib/wallet";

const CHAIN = "base";
type Preview = { request: OrderRequest; quote: QuoteResponse; symbol: string; unverified: boolean };

export default function Trade() {
  const { address, getSigner } = useWallet();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [type, setType] = useState<"market" | "limit">("market");
  const [token, setToken] = useState("WETH");
  const [qty, setQty] = useState("10");
  const [price, setPrice] = useState("");
  const [stop, setStop] = useState("");
  const [target, setTarget] = useState("");
  const [preview, setPreview] = useState<Preview>();
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const run = (fn: () => Promise<void>) => async () => {
    setBusy(true);
    setStatus("");
    try {
      await fn();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const getQuote = run(async () => {
    if (!address) throw new Error("Connect a wallet first");
    if (!(Number(qty) > 0)) throw new Error("Enter an amount");
    if (type === "limit" && !(Number(price) > 0)) throw new Error("Enter a limit price");
    const asset = await resolveBaseToken(flash, token);
    if (!asset) throw new Error(`${token} isn't on our list. Paste its Base contract address instead.`);
    const protect = side === "buy" && !!(stop || target);
    if (protect && !(Number(stop) > 0 && Number(target) > Number(stop))) throw new Error("Set both a stop and a target above it, or leave both empty");
    const request: OrderRequest = {
      targetChain: CHAIN, contraChain: CHAIN, targetAsset: asset.address, contraAsset: USDC_BASE,
      side, qty, orderType: type,
      // Flash rejects limitNotionalPrice on a limit entry with a bracket. Against USDC the pair rate is the USD price.
      ...(type === "limit" ? (protect ? { limitCrossPrice: price } : { limitNotionalPrice: price }) : {}),
      ...(protect ? { attachedBracket: { takeProfit: { notionalPrice: target }, stopLoss: { notionalPrice: stop } } } : {}),
    };
    setPreview({ request, quote: await prepareOrder(flash, address, request), symbol: asset.symbol, unverified: asset.riskFlagged });
  });

  const confirm = run(async () => {
    if (!preview) return;
    const { orderId } = await submitPrepared(flash, await getSigner(), preview.request, preview.quote);
    setPreview(undefined);
    setStatus(`Order placed: ${orderId}`);
  });

  const toggle = <T extends string>(options: readonly T[], value: T, set: (v: T) => void) => (
    <div className="row" style={{ flexWrap: "nowrap", gap: 8 }}>
      {options.map((o) => (
        <button key={o} className={`btn ${o === value ? "on" : ""}`} style={{ flex: "1 1 0", textTransform: "capitalize" }} onClick={() => { set(o); setPreview(undefined); }}>{o}</button>
      ))}
    </div>
  );

  const slippage = preview?.quote.recommendedSlippage;
  const typed = token.trim();
  const chartToken = BASE_TOKENS.find((t) => t.symbol.toLowerCase() === typed.toLowerCase())?.address ?? (/^0x[0-9a-fA-F]{40}$/.test(typed) ? typed : null);
  return (
    <>
      <Nav />
      <main className="wrap cols" style={{ paddingTop: 44, paddingBottom: 64 }}>
        <section className="main">
          <h1 className="big" style={{ marginBottom: 20 }}>Trade</h1>
          {chartToken
            ? <PriceChart token={chartToken} height={420} levels={[
                { label: "Limit", price: type === "limit" ? Number(price) || null : null, tone: "entry" },
                { label: "Stop", price: side === "buy" ? Number(stop) || null : null, tone: "stop" },
                { label: "Target", price: side === "buy" ? Number(target) || null : null, tone: "target" },
              ]} />
            : <p className="mut" style={{ margin: 0 }}>Enter a listed token or a Base address to see its chart.</p>}
        </section>
        <section className="side" style={{ gap: 14 }}>
          {toggle(["buy", "sell"] as const, side, setSide)}
          {toggle(["market", "limit"] as const, type, setType)}
          <div><label className="lab" htmlFor="token">Token symbol or Base address</label><input id="token" className="inp" value={token} onChange={(e) => { setToken(e.target.value); setPreview(undefined); }} /></div>
          <div><label className="lab" htmlFor="qty">{side === "buy" ? "Spend (USDC)" : `Sell (${token})`}</label><input id="qty" className="inp" inputMode="decimal" value={qty} onChange={(e) => { setQty(e.target.value); setPreview(undefined); }} /></div>
          {type === "limit" && <div><label className="lab" htmlFor="price">Limit price (USD)</label><input id="price" className="inp" inputMode="decimal" value={price} onChange={(e) => { setPrice(e.target.value); setPreview(undefined); }} /></div>}

          {side === "buy" && (
            <div className="row" style={{ flexWrap: "nowrap" }}>
              <div style={{ flex: "1 1 0", minWidth: 0 }}><label className="lab" htmlFor="stop">Stop loss, optional (USD)</label><input id="stop" className="inp" inputMode="decimal" value={stop} onChange={(e) => { setStop(e.target.value); setPreview(undefined); }} /></div>
              <div style={{ flex: "1 1 0", minWidth: 0 }}><label className="lab" htmlFor="target">Take profit, optional (USD)</label><input id="target" className="inp" inputMode="decimal" value={target} onChange={(e) => { setTarget(e.target.value); setPreview(undefined); }} /></div>
            </div>
          )}

          {preview && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "12px 0", borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)" }}>
              <div className="between"><span className="mut">You pay</span><span className="m">{preview.quote.from.amount} {side === "buy" ? "USDC" : preview.symbol}</span></div>
              <div className="between"><span className="mut">You get about</span><span className="m">{preview.quote.to.amount} {side === "buy" ? preview.symbol : "USDC"}</span></div>
              <div className="between"><span className="mut">Estimated fees</span><span className="m">${preview.quote.fees.estimatedFeeNotional}</span></div>
              {preview.unverified && <div className="dn">This token is flagged as risky or isn&apos;t on our list. Check the address carefully.</div>}
              {slippage && <div className="between"><span className="mut">Max slippage</span><span className="m">{(Number(slippage) * 100).toFixed(1)}%</span></div>}
            </div>
          )}

          {preview
            ? <button className="btn pri" disabled={busy} onClick={confirm}>{busy ? "Check your wallet" : "Confirm in wallet"}</button>
            : <button className="btn pri" disabled={busy || !address} onClick={getQuote}>{address ? (busy ? "Getting quote" : "Get quote") : "Connect a wallet to trade"}</button>}
          {status && <p role="status" style={{ margin: 0 }}>{status}</p>}
        </section>
      </main>
    </>
  );
}
