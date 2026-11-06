"use client";

import { USDC_BASE, type FlashBalancesResponse } from "@flashmob/flash";
import { useState } from "react";
import { encodeFunctionData, erc20Abi, parseEther, parseUnits } from "viem";
import { Drawer } from "@/components/drawer";
import { WalletAddress } from "@/components/wallet-address";
import { useCached } from "@/lib/cached";
import { flash } from "@/lib/flash";
import { plainError } from "@/lib/format";
import { useWallet } from "@/lib/wallet";

const USDC_DECIMALS = 6;
// Left in your own wallet, so you can still pay for your next transaction.
const KEEP_FOR_GAS_USD = 0.1;

/** Sends USDC and ETH from your wallet to an agent's. You approve each transfer in your wallet. */
export function FundAgent({ name, agentAddress, onClose, onSent }: { name: string; agentAddress: string; onClose(): void; onSent(): void }) {
  const { address, getSigner } = useWallet();
  const { data: balances } = useCached<FlashBalancesResponse["balances"]>(address ? `balances:${address}` : null, () => flash.balances(address!).then((b) => b.balances));
  const [usdc, setUsdc] = useState("");
  const [eth, setEth] = useState("0.30");
  const [step, setStep] = useState<"usdc" | "eth">();
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const myUsdc = Number(balances?.find((b) => b.chain === "base" && b.address.toLowerCase() === USDC_BASE.toLowerCase())?.balance ?? 0);
  const native = balances?.find((b) => b.chain === "base" && b.isNative);
  const myEthUsd = Number(native?.notional ?? 0);
  const ethPrice = native && Number(native.balance) > 0 ? myEthUsd / Number(native.balance) : 0;
  const usdcAmount = Number(usdc || 0);
  const ethAmount = Number(eth || 0);

  const problem = usdcAmount < 0 || ethAmount < 0 || !(usdcAmount + ethAmount > 0) ? "Enter an amount."
    : usdcAmount > myUsdc ? `You have $${myUsdc.toFixed(2)} USDC.`
    : ethAmount > 0 && !ethPrice ? "You have no ETH on Base to send."
    : ethAmount > 0 && ethAmount > myEthUsd - KEEP_FOR_GAS_USD ? `Keep a little ETH for gas. You can send up to $${Math.max(myEthUsd - KEEP_FOR_GAS_USD, 0).toFixed(2)}.`
    : null;

  const send = async () => {
    setError("");
    try {
      const signer = await getSigner();
      if (usdcAmount > 0) {
        setStep("usdc");
        await signer.sendTransaction({ to: USDC_BASE, data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [agentAddress as `0x${string}`, parseUnits(usdc, USDC_DECIMALS)] }) });
      }
      if (ethAmount > 0) {
        setStep("eth");
        await signer.sendTransaction({ to: agentAddress, data: "0x", value: parseEther((ethAmount / ethPrice).toFixed(18)) });
      }
      setDone(true);
      onSent();
    } catch (e) {
      setError(plainError(e));
    } finally {
      setStep(undefined);
    }
  };

  if (done) {
    return (
      <Drawer title="Funds sent" onClose={onClose}>
        <p style={{ margin: 0 }}>They should show on {name} shortly. With at least $1 USDC and some ETH, it starts by itself within a minute.</p>
        <button className="btn pri" onClick={onClose}>Done</button>
      </Drawer>
    );
  }

  return (
    <Drawer title={`Fund ${name}`} onClose={onClose}>
      <p className="mut" style={{ margin: 0 }}>What you send is the most it can lose. You can stop it and withdraw at any time.</p>
      <div>
        <div className="between"><label className="lab" htmlFor="fund-usdc">USDC to trade with</label><span className="mut" style={{ fontSize: 12 }}>You have ${myUsdc.toFixed(2)}</span></div>
        <input id="fund-usdc" className="inp" inputMode="decimal" placeholder="0.00" value={usdc} onChange={(e) => setUsdc(e.target.value)} />
      </div>
      <div>
        <div className="between"><label className="lab" htmlFor="fund-eth">ETH for approvals (USD)</label><span className="mut" style={{ fontSize: 12 }}>You have ${myEthUsd.toFixed(2)}</span></div>
        <input id="fund-eth" className="inp" inputMode="decimal" value={eth} onChange={(e) => setEth(e.target.value)} />
      </div>
      {(usdc !== "" || eth !== "") && problem && <p className="dn" style={{ margin: 0, fontSize: 13 }}>{problem}</p>}
      <button className="btn pri" disabled={!!problem || !!step} onClick={send}>{step ? <><span className="spin" />{step === "usdc" ? "Sending USDC" : "Sending ETH"}</> : "Send to agent"}</button>
      <p className="mut" style={{ margin: 0, fontSize: 12 }}>You'll approve each transfer in your wallet.</p>
      {error && <p role="alert" className="dn" style={{ margin: 0, fontSize: 13 }}>{error}</p>}
      <details>
        <summary className="mut" style={{ cursor: "pointer", fontSize: 13 }}>Send from somewhere else</summary>
        <div style={{ marginTop: 10 }}><WalletAddress address={agentAddress} /></div>
      </details>
    </Drawer>
  );
}
