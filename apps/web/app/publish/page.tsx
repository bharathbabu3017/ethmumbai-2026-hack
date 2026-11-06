"use client";

import { prepareOrder, resolveBaseToken, submitPrepared, USDC_BASE, type OrderRequest, type QuoteResponse } from "@flashmob/flash";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Nav } from "@/components/nav";
import { ensureSession, fetchMe, postJson, type Me } from "@/lib/account";
import { flash } from "@/lib/flash";
import { useWallet } from "@/lib/wallet";

const CHAIN = "base";
type Preview = { request: OrderRequest; quote: QuoteResponse; symbol: string; reference: number };

export default function Publish() {
  const router = useRouter();
  const { address, login, getSigner } = useWallet();
  const [me, setMe] = useState<Me>();
  const [profile, setProfile] = useState({ displayName: "", bio: "", xHandle: "" });
  const [form, setForm] = useState({ token: "WETH", type: "market" as "market" | "limit", entry: "", size: "", stop: "", target: "", note: "" });
  const [preview, setPreview] = useState<Preview>();
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { fetchMe().then(setMe).catch(() => {}); }, [address]);

  const field = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (e: { target: { value: string } }) => { setForm({ ...form, [key]: e.target.value }); setPreview(undefined); },
  });

  const run = (fn: () => Promise<void>) => async () => {
    setBusy(true);
    setStatus("");
    try { await fn(); } catch (e) { setStatus(e instanceof Error ? e.message : "Something went wrong"); } finally { setBusy(false); }
  };

  const createProfile = run(async () => {
    await ensureSession(getSigner);
    await postJson("/api/traders", profile);
    setMe(await fetchMe());
  });

  const review = run(async () => {
    if (!address) throw new Error("Connect a wallet first");
    const stop = Number(form.stop), target = Number(form.target);
    if (!(Number(form.size) > 0) || !(stop > 0) || !(target > 0)) throw new Error("Fill in size, stop and target");
    if (form.type === "limit" && !(Number(form.entry) > 0)) throw new Error("Enter an entry price");
    const asset = await resolveBaseToken(flash, form.token);
    if (!asset) throw new Error(`${form.token} isn't on our list. Paste its Base contract address instead.`);
    const request: OrderRequest = {
      targetChain: CHAIN, contraChain: CHAIN, targetAsset: asset.address, contraAsset: USDC_BASE,
      side: "buy", qty: form.size, orderType: form.type,
      // Flash rejects limitNotionalPrice on a limit entry with a bracket. Against USDC the pair rate is the USD price.
      ...(form.type === "limit" ? { limitCrossPrice: form.entry } : {}),
      attachedBracket: { takeProfit: { notionalPrice: form.target }, stopLoss: { notionalPrice: form.stop } },
    };
    const quote = await prepareOrder(flash, address, request);
    const reference = form.type === "limit" ? Number(form.entry) : Number(quote.from.notional) / Number(quote.to.amount);
    if (!(stop < reference && reference < target)) throw new Error(`Stop must be below and target above the entry, about $${reference.toFixed(2)}`);
    setPreview({ request, quote, symbol: asset.symbol, reference });
  });

  const publish = run(async () => {
    if (!preview) return;
    await ensureSession(getSigner);
    const { orderId } = await submitPrepared(flash, await getSigner(), preview.request, preview.quote);
    setStatus(`Order placed (${orderId}). Publishing your call…`);
    const { traderId } = await postJson<{ traderId: string }>("/api/calls", { orderId, note: form.note });
    router.push(`/traders/${traderId}`);
  });

  return (
    <>
      <Nav />
      <main className="wrap" style={{ maxWidth: 480, paddingTop: 44, paddingBottom: 64 }}>
        <h1 className="big" style={{ marginBottom: 6 }}>Publish a call</h1>
        <p className="mut" style={{ margin: "0 0 24px" }}>Your call is a real order. It goes live for followers once you sign it.</p>

        {!address ? (
          <button className="btn pri" onClick={login}>Connect a wallet to publish</button>
        ) : !me?.trader ? (
          <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <h2 style={{ fontSize: 18 }}>Create your trader profile</h2>
            <div><label className="lab" htmlFor="name">Display name</label><input id="name" className="inp" value={profile.displayName} onChange={(e) => setProfile({ ...profile, displayName: e.target.value })} /></div>
            <div><label className="lab" htmlFor="bio">Bio</label><input id="bio" className="inp" value={profile.bio} onChange={(e) => setProfile({ ...profile, bio: e.target.value })} /></div>
            <div><label className="lab" htmlFor="x">X handle</label><input id="x" className="inp" value={profile.xHandle} onChange={(e) => setProfile({ ...profile, xHandle: e.target.value })} /></div>
            <button className="btn pri" disabled={busy} onClick={createProfile}>Create profile</button>
            {status && <p role="alert" className="dn" style={{ margin: 0 }}>{status}</p>}
          </section>
        ) : (
          <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div><label className="lab" htmlFor="token">Token symbol or Base address</label><input id="token" className="inp" {...field("token")} /></div>
            <div className="row" style={{ flexWrap: "nowrap", gap: 8 }}>
              {(["market", "limit"] as const).map((t) => (
                <button key={t} className={`btn ${form.type === t ? "on" : ""}`} style={{ flex: "1 1 0", textTransform: "capitalize" }} onClick={() => { setForm({ ...form, type: t }); setPreview(undefined); }}>{t}</button>
              ))}
            </div>
            {form.type === "limit" && <div><label className="lab" htmlFor="entry">Entry price (USD)</label><input id="entry" className="inp" inputMode="decimal" {...field("entry")} /></div>}
            <div><label className="lab" htmlFor="size">Your size (USDC)</label><input id="size" className="inp" inputMode="decimal" {...field("size")} /></div>
            <div className="row" style={{ flexWrap: "nowrap" }}>
              <div style={{ flex: "1 1 0" }}><label className="lab" htmlFor="stop">Stop loss (USD)</label><input id="stop" className="inp" inputMode="decimal" {...field("stop")} /></div>
              <div style={{ flex: "1 1 0" }}><label className="lab" htmlFor="target">Take profit (USD)</label><input id="target" className="inp" inputMode="decimal" {...field("target")} /></div>
            </div>
            <div><label className="lab" htmlFor="note">Why this trade</label><input id="note" className="inp" {...field("note")} /></div>

            {preview && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "12px 0", borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)" }}>
                <div className="between"><span className="mut">Long</span><span className="m">{preview.symbol} on Base</span></div>
                <div className="between"><span className="mut">Entry</span><span className="m">${preview.reference.toFixed(2)}</span></div>
                <div className="between"><span className="mut">You get about</span><span className="m">{preview.quote.to.amount}</span></div>
                <div className="between"><span className="mut">Estimated fees</span><span className="m">${preview.quote.fees.estimatedFeeNotional}</span></div>
                {preview.quote.recommendedSlippage && <div className="between"><span className="mut">Max slippage</span><span className="m">{(Number(preview.quote.recommendedSlippage) * 100).toFixed(1)}%</span></div>}
                <p className="mut" style={{ margin: "6px 0 0", fontSize: 13 }}>This spends real funds. Keep the tokens in your wallet while the call is live, or the stop and target can't execute.</p>
              </div>
            )}

            {preview
              ? <button className="btn pri" disabled={busy} onClick={publish}>{busy ? "Check your wallet" : "Sign and publish"}</button>
              : <button className="btn pri" disabled={busy} onClick={review}>{busy ? "Getting quote" : "Review call"}</button>}
            {status && <p role="status" style={{ margin: 0 }}>{status}</p>}
          </section>
        )}
      </main>
    </>
  );
}
