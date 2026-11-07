"use client";

import type { FlashBalancesResponse } from "@flashmob/flash";
import { TokenIcon } from "@/components/token-icon";

export type Balance = FlashBalancesResponse["balances"][number];

export interface AssetAmountValue {
  asset?: Balance;
  amount: string;
  /** Max was pressed, and the amount hasn't been changed since. */
  max: boolean;
}

/** What's in a wallet on Base, which is the only network funds move on here. */
export const onBase = (balances: Balance[] | undefined) => (balances ?? []).filter((b) => b.chain === "base" && Number(b.balance) > 0);

const SHOWN_DECIMALS = 8;

/** `most` as plain digits. Whole balances stay exact, and the rest rounds down so it never passes what's held. */
function plain(asset: Balance, most: number) {
  if (most === Number(asset.balance)) return asset.balance;
  const decimals = Math.min(asset.tokenDecimals, SHOWN_DECIMALS);
  return (Math.floor(most * 10 ** decimals) / 10 ** decimals).toFixed(decimals).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}

/** Why this amount can't be sent, or null if it can. `most` is what can really leave the wallet. */
export function amountProblem({ asset, amount }: AssetAmountValue, most: number) {
  if (!asset) return "Pick what to send.";
  if (!/^\d+(\.\d+)?$/.test(amount) || !(Number(amount) > 0)) return "Enter an amount.";
  if (Number(amount) > most) return `You can send up to ${plain(asset, most)} ${asset.symbol}.`;
  return null;
}

/** Picks one asset from a wallet and how much of it. */
export function AssetAmount({ assets, value, most, onChange }: { assets: Balance[]; value: AssetAmountValue; most: number; onChange(value: AssetAmountValue): void }) {
  return (
    <>
      <div>
        <span className="lab">Asset</span>
        <div className="row" style={{ gap: 6 }}>
          {assets.map((a) => {
            const selected = a.address === value.asset?.address;
            return <button key={a.address} className={`asset ${selected ? "sel" : ""}`} aria-pressed={selected} onClick={() => onChange({ asset: a, amount: "", max: false })}><TokenIcon token={a} size={18} />{a.symbol}</button>;
          })}
        </div>
      </div>
      {value.asset && (
        <div>
          <div className="between"><label className="lab" htmlFor="asset-amount">Amount</label><span className="mut" style={{ fontSize: 12 }}>Available {plain(value.asset, most)} {value.asset.symbol}</span></div>
          <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
            <input id="asset-amount" className="inp" inputMode="decimal" placeholder="0.00" value={value.amount} onChange={(e) => onChange({ ...value, amount: e.target.value, max: false })} />
            <button className="btn" disabled={most <= 0} onClick={() => onChange({ ...value, amount: plain(value.asset!, most), max: true })}>Max</button>
          </div>
        </div>
      )}
    </>
  );
}
