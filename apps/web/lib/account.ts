"use client";

import type { CopySettings } from "@flashmob/flash";
import { loginMessage } from "./login";


export interface Me {
  address: string | null;
  walletType?: "external" | "embedded";
  /** The wallet the bot and auto-copy use, once it exists and is approved. */
  tradingWallet?: string | null;
  trader?: { id: string; displayName: string } | null;
  telegramLinked?: boolean;
  following?: { id: string; displayName: string }[];
  autoCopies?: { traderId: string; displayName: string; settings: CopySettings; enabled: boolean }[];
  copyPaused?: boolean;
  copies?: { id: string; amountUsd: number; sourceOrderId: string; tokenSymbol: string | null; trader: string; traderId: string }[];
}

export const fetchMe = (): Promise<Me> => fetch("/api/me").then((r) => r.json());

export async function postJson<T>(url: string, body: unknown = {}): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Something went wrong");
  return json;
}

/** Asks the wallet for a free sign-in signature, unless this wallet already has a session. */
export async function ensureSession(getSigner: () => Promise<{ address: string; signMessage(message: string): Promise<string> }>) {
  const signer = await getSigner();
  const me = await fetchMe();
  if (me.address?.toLowerCase() === signer.address.toLowerCase()) return me;
  const message = loginMessage(location.host, signer.address, new Date().toISOString());
  await postJson("/api/auth/login", { address: signer.address, message, signature: await signer.signMessage(message) });
  return fetchMe();
}
