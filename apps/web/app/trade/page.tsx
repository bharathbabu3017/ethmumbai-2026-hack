"use client";

import { prepareOrder, submitPrepared, type OrderRequest, type QuoteResponse } from "@flashmob/flash";
import { useState } from "react";
import { Nav } from "@/components/nav";
import { flash, USDC_BASE } from "@/lib/flash";
import { useWallet } from "@/lib/wallet";

const CHAIN = "base";
type Preview = { request: OrderRequest; quote: QuoteResponse; symbol: string };

export default function Trade() {
  const { address, getSigner } = useWallet();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [type, setType] = useState<"market" | "limit">("market");
  const [token, setToken] = useState("WETH");
  const [qty, setQty] = useState("10");
  const [price, setPrice] = useState("");
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
    const { assets } = await flash.search(token, { chain: CHAIN, limit: 10 });
    const q = token.toLowerCase();
    const asset = assets.find((a) => a.symbol.toLowerCase() === q || a.address.toLowerCase() === q);
    if (!asset) throw new Error(`Couldn't find ${token} on Base`);
    const request: OrderRequest = {
      targetChain: CHAIN, contraChain: CHAIN, targetAsset: asset.address, contraAsset: USDC_BASE,
      side, qty, orderType: type,
      ...(type === "limit" ? { limitNotionalPrice: price } : {}),
    };
    setPreview({ request, quote: await prepareOrder(flash, address, request), symbol: asset.symbol });
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
        <button key={o} className={`btn ${o === value ? "pri" : ""}`} style={{ flex: "1 1 0", textTransform: "capitalize" }} onClick={() => { set(o); setPreview(undefined); }}>{o}</button>
      ))}
    </div>
  );

  const slippage = preview?.quote.recommendedSlippage;
  return (
    <>
      <Nav />
      <main className="wrap" style={{ maxWidth: 560, paddingTop: 28, paddingBottom: 48 }}>
        <h1 style={{ fontSize: 32, marginBottom: 18 }}>Trade</h1>
        <section className="card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          {toggle(["buy", "sell"] as const, side, setSide)}
          {toggle(["market", "limit"] as const, type, setType)}
          <div><label className="lab" htmlFor="token">Token on Base</label><input id="token" className="inp" value={token} onChange={(e) => { setToken(e.target.value); setPreview(undefined); }} /></div>
          <div><label className="lab" htmlFor="qty">{side === "buy" ? "Spend (USDC)" : `Sell (${token})`}</label><input id="qty" className="inp" inputMode="decimal" value={qty} onChange={(e) => { setQty(e.target.value); setPreview(undefined); }} /></div>
          {type === "limit" && <div><label className="lab" htmlFor="price">Limit price (USD)</label><input id="price" className="inp" inputMode="decimal" value={price} onChange={(e) => { setPrice(e.target.value); setPreview(undefined); }} /></div>}

          {preview && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "12px 0", borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)" }}>
              <div className="between"><span className="mut">You pay</span><span className="m">{preview.quote.from.amount} {side === "buy" ? "USDC" : preview.symbol}</span></div>
              <div className="between"><span className="mut">You get about</span><span className="m">{preview.quote.to.amount} {side === "buy" ? preview.symbol : "USDC"}</span></div>
              <div className="between"><span className="mut">Estimated fees</span><span className="m">${preview.quote.fees.estimatedFeeNotional}</span></div>
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
