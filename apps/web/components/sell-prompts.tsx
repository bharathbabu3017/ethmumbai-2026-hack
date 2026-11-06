"use client";

import { buildOrder, prepareOrder, type TradeForm } from "@flashmob/flash";
import { useCallback, useEffect, useState } from "react";
import { ensureSession, postJson } from "@/lib/account";
import { flash } from "@/lib/flash";
import { mirrorPlan, mirrorSummary, type MirrorPrompt } from "@flashmob/flash";
import { useWallet } from "@/lib/wallet";

const act = (id: string, body: object) => postJson(`/api/mirrors/${id}`, body);

/** Prompts to sell the same share as a trader you copied. */
export function SellPrompts() {
  const { address, actions, getSigner, miniApp } = useWallet();
  const [prompts, setPrompts] = useState<MirrorPrompt[]>([]);
  const [busy, setBusy] = useState<string>();
  const [status, setStatus] = useState("");

  const refresh = useCallback(async () => {
    const res = await fetch("/api/mirrors");
    if (res.ok) setPrompts((await res.json()).prompts);
  }, []);
  useEffect(() => { if (address) refresh().catch(() => {}); }, [address, refresh]);

  const placeOrder = async (form: Omit<TradeForm, "tokenAddress" | "funder">, token: string) => {
    const built = buildOrder({ ...form, tokenAddress: token, funder: address! });
    if ("error" in built) throw new Error(built.error);
    return actions.place(built.request, await prepareOrder(flash, address!, built.request));
  };

  const sell = async (m: MirrorPrompt) => {
    setBusy(m.id);
    setStatus("");
    const plan = mirrorPlan(m);
    let cancelled = false;
    let sold = false;
    try {
      await ensureSession(getSigner);
      await act(m.id, { action: "claim" });
      // The exits have to go first: Flash can't sell tokens that a smaller balance no longer covers.
      for (const id of plan.cancel) await actions.cancel(id);
      cancelled = plan.cancel.length > 0;
      const { orderId } = await placeOrder({ side: "sell", type: "market", qty: plan.sellQty }, m.tokenAddress);
      sold = true;
      await act(m.id, { action: "complete", orderId }).catch(() => {});
      if (plan.protectQty) await placeOrder({ side: "sell", type: "bracket", qty: plan.protectQty, bracketStop: String(m.stop), bracketTarget: String(m.target) }, m.tokenAddress);
      setStatus(`Sold ${plan.sellQty} ${m.tokenSymbol}.`);
    } catch (e) {
      const reason = e instanceof Error ? e.message : "Something went wrong";
      if (sold) setStatus(`Sold ${plan.sellQty} ${m.tokenSymbol}, but your new stop and target weren't placed, so the rest isn't protected. ${reason}`);
      else {
        await act(m.id, { action: "release" }).catch(() => {});
        setStatus(`${reason}${cancelled ? ` Your stop and target were already cancelled, so your ${m.tokenSymbol} isn't protected right now.` : ""}`);
      }
    } finally {
      setBusy(undefined);
      await refresh().catch(() => {});
    }
  };

  const keep = async (m: MirrorPrompt) => {
    setBusy(m.id);
    await ensureSession(getSigner).then(() => act(m.id, { action: "dismiss" })).catch((e) => setStatus(e.message));
    setBusy(undefined);
    await refresh().catch(() => {});
  };

  if (!prompts.length && !status) return null;
  return (
    <section className="panel" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <h2 style={{ fontSize: 16 }}>Traders you copied sold</h2>
      {prompts.map((m) => {
        const usable = address?.toLowerCase() === m.walletAddress.toLowerCase();
        return (
          <div key={m.id} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div><strong>{m.trader}</strong> sold {m.percent.toFixed(0)}% of their {m.tokenSymbol}.</div>
            <div className="mut">Sell the same share of your copy: <span className="m">{mirrorPlan(m).sellQty} {m.tokenSymbol}</span>. {mirrorSummary(m)}</div>
            {usable ? (
              <div className="row" style={{ gap: 8 }}>
                <button className="btn pri" disabled={!!busy} onClick={() => sell(m)}>{busy === m.id ? (miniApp ? "Selling" : "Check your wallet") : "Sell"}</button>
                <button className="btn" disabled={!!busy} onClick={() => keep(m)}>Keep position</button>
              </div>
            ) : (
              <p className="mut" style={{ margin: 0, fontSize: 13 }}>{m.walletType === "bot" ? "This is on your Telegram wallet. Open the app in Telegram to sell." : "Connect the wallet that made this copy to sell."}</p>
            )}
          </div>
        );
      })}
      {status && <p role="status" style={{ margin: 0 }}>{status}</p>}
    </section>
  );
}
