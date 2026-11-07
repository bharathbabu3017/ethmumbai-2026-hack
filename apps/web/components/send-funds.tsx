"use client";

import { useState } from "react";
import { encodeFunctionData, erc20Abi, isAddress, parseEther, parseUnits, zeroAddress } from "viem";
import { AssetAmount, amountProblem, type AssetAmountValue, type Balance } from "@/components/asset-amount";
import { Drawer } from "@/components/drawer";
import { plainError } from "@/lib/format";
import { CHAINS, useWallet } from "@/lib/wallet";

// Left in your wallet, so the transfer itself can be paid for. Ethereum's gas costs far more.
const KEEP_FOR_GAS_USD = 0.1;
const KEEP_ON_ETHEREUM_USD = 2;

const chainName = (chain: string) => (chain === "bsc" ? "BNB Chain" : chain.charAt(0).toUpperCase() + chain.slice(1));

/** What the wallet holds on networks it can send from, largest first. */
const sendable = (balances: Balance[]) => balances.filter((b) => CHAINS[b.chain] && Number(b.balance) > 0).sort((a, b) => Number(b.notional) - Number(a.notional));

/** A reason not to send here, for the mistakes that lose funds for good. */
function addressProblem(to: string, own: string | undefined, assets: Balance[]) {
  if (!isAddress(to)) return "That isn't a valid address.";
  const lower = to.toLowerCase();
  if (lower === zeroAddress) return "Funds sent to this address are lost.";
  if (lower === own?.toLowerCase()) return "That's this wallet.";
  if (assets.some((a) => a.address.toLowerCase() === lower)) return "That's a token contract, and funds sent to it are lost.";
  return null;
}

/** Sends from your own wallet to any address, on any network it holds funds on. You approve it in your wallet, and the server plays no part. */
export function SendFunds({ balances, onClose, onSent }: { balances: Balance[]; onClose(): void; onSent(): void }) {
  const { address, getSigner } = useWallet();
  const [held] = useState(() => sendable(balances));
  const [value, setValue] = useState<AssetAmountValue>({ asset: held[0], amount: "", max: false });
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const { asset, amount } = value;
  const chain = asset?.chain ?? "base";
  const chains = [...new Set(held.map((a) => a.chain))];
  const assets = held.filter((a) => a.chain === chain);
  const gasSymbol = CHAINS[chain]!.nativeCurrency.symbol;
  const noGas = !assets.some((a) => a.isNative);
  const balance = Number(asset?.balance ?? 0);
  const keepUsd = chain === "ethereum" ? KEEP_ON_ETHEREUM_USD : KEEP_FOR_GAS_USD;
  const keep = asset?.isNative ? (keepUsd / Number(asset.notional)) * balance : 0;
  const most = Math.max(balance - keep, 0);
  const destination = to.trim();
  const toProblem = destination ? addressProblem(destination, address, held) : null;
  const gasProblem = noGas ? `You need some ${gasSymbol} on ${chainName(chain)} to pay for this send.` : null;
  const problem = gasProblem ?? amountProblem(value, most) ?? (destination ? toProblem : "Enter an address.");

  const send = async () => {
    setBusy(true);
    setError("");
    try {
      const signer = await getSigner(chain);
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
        <p style={{ margin: 0 }}>{amount} {asset!.symbol} on {chainName(chain)} went to <span className="m" style={{ wordBreak: "break-all" }}>{destination}</span>.</p>
        <button className="btn pri" onClick={onClose}>Done</button>
      </Drawer>
    );
  }

  return (
    <Drawer title="Send from your wallet" onClose={onClose}>
      {!assets.length ? <p style={{ margin: 0 }}>Your wallet is empty.</p> : (
        <>
          <div>
            <span className="lab">Network</span>
            <div className="row" style={{ gap: 6 }}>
              {chains.map((c) => <button key={c} className={`asset ${c === chain ? "sel" : ""}`} aria-pressed={c === chain} onClick={() => setValue({ asset: held.find((a) => a.chain === c), amount: "", max: false })}>{chainName(c)}</button>)}
            </div>
          </div>
          <AssetAmount assets={assets} value={value} most={most} onChange={setValue} />
          <div>
            <label className="lab" htmlFor="send-to">To an address on {chainName(chain)}</label>
            <input id="send-to" className="inp" placeholder="0x…" spellCheck={false} autoComplete="off" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          {(gasProblem || toProblem || (amount !== "" && problem)) && <p className="dn" style={{ margin: 0, fontSize: 13 }}>{gasProblem ?? toProblem ?? problem}</p>}
          <button className="btn pri" disabled={!!problem || busy} onClick={send}>{busy ? <><span className="spin" />Sending</> : "Send"}</button>
          <p className="mut" style={{ margin: 0, fontSize: 12 }}>Check the address and network. Sends can't be undone, and an exchange that doesn't support {chainName(chain)} won't receive them. You'll approve this in your wallet.</p>
        </>
      )}
      {error && <p role="alert" className="dn" style={{ margin: 0, fontSize: 13 }}>{error}</p>}
    </Drawer>
  );
}
