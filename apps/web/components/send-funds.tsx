"use client";

import { useState } from "react";
import { encodeFunctionData, erc20Abi, isAddress, parseEther, parseUnits, zeroAddress } from "viem";
import { AssetAmount, amountProblem, onBase, type AssetAmountValue, type Balance } from "@/components/asset-amount";
import { Drawer } from "@/components/drawer";
import { plainError } from "@/lib/format";
import { useWallet } from "@/lib/wallet";

// Left in your wallet, so the transfer itself can be paid for.
const KEEP_FOR_GAS_USD = 0.1;

/** A reason not to send here, for the mistakes that lose funds for good. */
function addressProblem(to: string, own: string | undefined, assets: Balance[]) {
  if (!isAddress(to)) return "That isn't a valid address.";
  const lower = to.toLowerCase();
  if (lower === zeroAddress) return "Funds sent to this address are lost.";
  if (lower === own?.toLowerCase()) return "That's this wallet.";
  if (assets.some((a) => a.address.toLowerCase() === lower)) return "That's a token contract, and funds sent to it are lost.";
  return null;
}

/** Sends from your own wallet to any address on Base. You approve it in your wallet, and the server plays no part. */
export function SendFunds({ balances, onClose, onSent }: { balances: Balance[]; onClose(): void; onSent(): void }) {
  const { address, getSigner } = useWallet();
  const [value, setValue] = useState<AssetAmountValue>({ amount: "", max: false });
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const assets = onBase(balances);
  const { asset, amount } = value;
  const held = Number(asset?.balance ?? 0);
  const keepEth = asset?.isNative ? (KEEP_FOR_GAS_USD / Number(asset.notional)) * held : 0;
  const most = Math.max(held - keepEth, 0);
  const destination = to.trim();
  const toProblem = destination ? addressProblem(destination, address, assets) : null;
  const problem = amountProblem(value, most) ?? (destination ? toProblem : "Enter an address.");

  const send = async () => {
    setBusy(true);
    setError("");
    try {
      const signer = await getSigner();
      if (asset!.isNative) await signer.sendTransaction({ to: destination, data: "0x", value: parseEther(amount) });
      else await signer.sendTransaction({ to: asset!.address, data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [destination as `0x${string}`, parseUnits(amount, asset!.tokenDecimals)] }) });
      setDone(true);
      onSent();
    } catch (e) {
      setError(plainError(e));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <Drawer title="Funds sent" onClose={onClose}>
        <p style={{ margin: 0 }}>{amount} {asset!.symbol} went to <span className="m" style={{ wordBreak: "break-all" }}>{destination}</span>.</p>
        <button className="btn pri" onClick={onClose}>Done</button>
      </Drawer>
    );
  }

  return (
    <Drawer title="Send from your wallet" onClose={onClose}>
      {!assets.length ? <p style={{ margin: 0 }}>Your wallet is empty on Base.</p> : (
        <>
          <AssetAmount assets={assets} value={value} most={most} onChange={setValue} />
          <div>
            <label className="lab" htmlFor="send-to">To an address on Base</label>
            <input id="send-to" className="inp" placeholder="0x…" spellCheck={false} autoComplete="off" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          {((amount !== "" && problem && !toProblem) || toProblem) && <p className="dn" style={{ margin: 0, fontSize: 13 }}>{toProblem ?? problem}</p>}
          <button className="btn pri" disabled={!!problem || busy} onClick={send}>{busy ? <><span className="spin" />Sending</> : "Send"}</button>
          <p className="mut" style={{ margin: 0, fontSize: 12 }}>Check the address and network. Sends can't be undone, and an exchange that doesn't support Base won't receive them. You'll approve this in your wallet.</p>
        </>
      )}
      {error && <p role="alert" className="dn" style={{ margin: 0, fontSize: 13 }}>{error}</p>}
    </Drawer>
  );
}
