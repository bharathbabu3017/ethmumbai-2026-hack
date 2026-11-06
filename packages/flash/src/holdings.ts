import type { FlashBalancesResponse } from "./client";
import { USDC_BASE } from "./tokens";

type Balance = FlashBalancesResponse["balances"][number];

export interface Held {
  tokenAddress: string;
  qty: number;
  costUsd: number;
}

export interface Holding {
  key: string;
  address: string;
  balance: string;
  symbol: string;
  chain: string;
  qty: number;
  valueUsd: number;
  /** Only known for what was bought on Flashmob, so these are null for deposits and stablecoins. */
  pnlUsd: number | null;
  pnlPercent: number | null;
  isCash: boolean;
}

const DUST_USD = 0.01;

export const signedUsd = (n: number) => `${n < 0 ? "-" : "+"}$${Math.abs(n).toFixed(2)}`;

/** Joins what the wallet holds now with what it paid. Tokens that arrived some other way count as value, not as profit. */
export function holdings(balances: Balance[], positions: Held[], realizedUsd: number) {
  const rows: Holding[] = balances
    .filter((b) => Number(b.notional ?? 0) >= DUST_USD)
    .map((b) => {
      const qty = Number(b.balance);
      const valueUsd = Number(b.notional);
      const held = b.chain === "base" && !b.isNative ? positions.find((p) => p.tokenAddress.toLowerCase() === b.address.toLowerCase()) : undefined;
      const tracked = held && held.qty > 0 ? Math.min(held.qty, qty) : 0;
      const isCash = b.isNative || b.address.toLowerCase() === USDC_BASE.toLowerCase();
      const row = { key: b.chain + b.address + b.isNative, address: b.address, balance: b.balance, isCash, symbol: b.symbol, chain: b.chain, qty, valueUsd };
      if (!held || !tracked || !held.costUsd) return { ...row, pnlUsd: null, pnlPercent: null };
      const cost = held.costUsd * (tracked / held.qty);
      const pnlUsd = valueUsd * (tracked / qty) - cost;
      return { ...row, pnlUsd, pnlPercent: (pnlUsd / cost) * 100 };
    })
    .sort((a, b) => b.valueUsd - a.valueUsd);
  return {
    rows,
    totalUsd: rows.reduce((sum, r) => sum + r.valueUsd, 0),
    openPnlUsd: rows.reduce((sum, r) => sum + (r.pnlUsd ?? 0), 0),
    realizedUsd,
  };
}
