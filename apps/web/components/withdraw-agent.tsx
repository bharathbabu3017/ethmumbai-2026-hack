"use client";

import { AGENT_GAS_RESERVE_ETH, NATIVE_ASSET, WITHDRAW_ALL, type FlashBalancesResponse } from "@flashmob/flash";
import { useState } from "react";
import { AssetAmount, amountProblem, onBase, type AssetAmountValue } from "@/components/asset-amount";
import { Drawer } from "@/components/drawer";
import { ensureSession, postJson } from "@/lib/account";
import { useCached } from "@/lib/cached";
import { flash } from "@/lib/flash";
import { plainError } from "@/lib/format";
import { useWallet } from "@/lib/wallet";

const POLL_MS = 1_500;
const POLLS = 60;

/** Waits for the worker, so the owner sees the real outcome and not just that it was asked for. */
async function outcome(agentId: string, jobId: string) {
  for (let i = 0; i < POLLS; i++) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    const res = await fetch(`/api/agents/${agentId}?job=${jobId}`);
    if (!res.ok) continue;
    const { status, error } = (await res.json()) as { status: string; error: string | null };
    if (status === "done") return "sent";
    if (status === "failed") throw new Error(error ?? "The withdrawal failed. Your funds are still in the agent's wallet.");
  }
  return "slow";
}

/** Takes part of an agent's funds back to its owner while it keeps running. */
export function WithdrawAgent({ id, name, agentAddress, onClose, onSent }: { id: string; name: string; agentAddress: string; onClose(): void; onSent(): void }) {
  const { address, getSigner } = useWallet();
  const { data: balances } = useCached<FlashBalancesResponse["balances"]>(`balances:${agentAddress}`, () => flash.balances(agentAddress).then((b) => b.balances));
  const [value, setValue] = useState<AssetAmountValue>({ amount: "", max: false });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<"sent" | "slow">();
  const [error, setError] = useState("");

  const assets = onBase(balances);
  const { asset } = value;
  const most = !asset ? 0 : asset.isNative ? Math.max(Number(asset.balance) - Number(AGENT_GAS_RESERVE_ETH), 0) : Number(asset.balance);
  const problem = amountProblem(value, most);

  const withdraw = async () => {
    setBusy(true);
    setError("");
    try {
      await ensureSession(getSigner);
      const { jobId } = await postJson<{ jobId: string }>(`/api/agents/${id}`, { action: "withdraw", token: asset!.isNative ? NATIVE_ASSET : asset!.address, amount: value.max ? WITHDRAW_ALL : value.amount });
      setResult(await outcome(id, jobId));
      onSent();
    } catch (e) {
      setError(plainError(e));
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    return (
      <Drawer title={result === "sent" ? "Withdrawal sent" : "Still sending"} onClose={onClose}>
        <p style={{ margin: 0 }}>{result === "sent" ? "It's on its way to your wallet and should show shortly." : "This is taking longer than usual. Check both balances in a minute before trying again."}</p>
        <button className="btn pri" onClick={onClose}>Done</button>
      </Drawer>
    );
  }

  return (
    <Drawer title={`Withdraw from ${name}`} onClose={onClose}>
      <p className="mut" style={{ margin: 0 }}>Takes funds back without stopping it. Only you can do this, and it can only go to your wallet.</p>
      {!balances ? <div className="sk" style={{ height: 120 }} /> : !assets.length ? <p style={{ margin: 0 }}>This agent's wallet is empty.</p> : (
        <>
          <AssetAmount assets={assets} value={value} most={most} onChange={setValue} />
          {value.amount !== "" && problem && <p className="dn" style={{ margin: 0, fontSize: 13 }}>{problem}</p>}
          <button className="btn pri" disabled={!!problem || busy} onClick={withdraw}>{busy ? <><span className="spin" />Sending</> : "Withdraw to your wallet"}</button>
          <p className="mut" style={{ margin: 0, fontSize: 12 }}>Funds go to {address?.slice(0, 6)}…{address?.slice(-4)}. Open orders that need these funds won't be able to fill, and an agent with no ETH can't approve new trades.</p>
        </>
      )}
      {error && <p role="alert" className="dn" style={{ margin: 0, fontSize: 13 }}>{error}</p>}
    </Drawer>
  );
}
