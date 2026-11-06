"use client";

import { PrivyProvider, usePrivy, useWallets } from "@privy-io/react-auth";
import { batchCancelMessage, buildUpdate, cancelMessage, submitPrepared, type EditableOrder, type OrderRequest, type QuoteResponse } from "@flashmob/flash";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { createPublicClient, createWalletClient, custom, http, type Hex } from "viem";
import { fetchMe, postJson } from "./account";
import { flash } from "./flash";
import { arbitrum, base, mainnet, optimism, polygon, type Chain } from "viem/chains";

const CHAINS: Record<string, Chain> = { base, ethereum: mainnet, arbitrum, optimism, polygon };

export interface BrowserSigner {
  address: string;
  signTypedData(typedData: string): Promise<string>;
  signMessage(message: string): Promise<string>;
  /** Resolves once the transaction is mined, so an order can safely follow it. */
  sendTransaction(tx: { to: string; data: string }): Promise<string>;
}

/** Everything that needs the wallet's approval. A browser wallet signs, and the Mini App asks the worker. */
export interface WalletActions {
  place(request: OrderRequest, quote: QuoteResponse, chain?: string): Promise<{ orderId: string }>;
  cancel(orderId: string): Promise<void>;
  cancelMany(orderIds: string[]): Promise<void>;
  update(orderId: string, order: EditableOrder, next: Record<string, string>): Promise<void>;
}

interface WalletState {
  configured: boolean;
  ready: boolean;
  miniApp?: boolean;
  address?: string;
  actions: WalletActions;
  login(): void;
  logout(): void;
  /** A signer on the given chain, which is Base unless an order is paid from elsewhere. */
  getSigner(chain?: string): Promise<BrowserSigner>;
}

const unavailable = () => Promise.reject(new Error("Connect a wallet first"));

const notConfigured: WalletState = {
  configured: false,
  ready: true,
  login() {},
  logout() {},
  getSigner: () => Promise.reject(new Error("Wallet login isn't set up yet")),
  actions: { place: unavailable, cancel: unavailable, cancelMany: unavailable, update: unavailable },
};

function browserActions(getSigner: (chain?: string) => Promise<BrowserSigner>): WalletActions {
  return {
    place: async (request, quote, chain) => submitPrepared(flash, await getSigner(chain), request, quote),
    async cancel(orderId) {
      const signer = await getSigner();
      const message = cancelMessage(orderId);
      await flash.cancelOrder(orderId, { cancelMessage: message, userSignature: await signer.signMessage(message) });
    },
    async cancelMany(orderIds) {
      const signer = await getSigner();
      const message = batchCancelMessage(orderIds);
      await flash.cancelOrders({ orderIds, cancelMessage: message, userSignature: await signer.signMessage(message) });
    },
    async update(orderId, order, next) {
      const signer = await getSigner();
      const { message, body } = buildUpdate(orderId, order, next, new Date().toISOString());
      await flash.updateOrder(orderId, { ...body, updateMessage: message, userSignature: await signer.signMessage(message) });
    },
  };
}

const JOB_POLL_MS = 1000;
const JOB_WAIT_MS = 90_000;

/** Queues an action for the worker and waits for the outcome. */
async function runJob<T>(kind: string, payload: unknown): Promise<T> {
  const { id } = await postJson<{ id: string }>("/api/wallet-jobs", { kind, payload });
  const deadline = Date.now() + JOB_WAIT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, JOB_POLL_MS));
    const job = await fetch(`/api/wallet-jobs/${id}`).then((r) => r.json());
    if (job.status === "done") return job.result;
    if (job.status === "failed") throw new Error(job.error ?? "That didn't go through");
  }
  throw new Error("This is taking too long. Check your orders before trying again.");
}

const miniActions: WalletActions = {
  place: (request, quote) => runJob("order", { request, minReceived: request.orderType === "market" ? Number(quote.to.amount) : undefined }),
  cancel: (orderId) => runJob("cancel", { orderId }),
  cancelMany: (orderIds) => runJob("cancelMany", { orderIds }),
  update: (orderId, _order, next) => runJob("update", { orderId, next }),
};

/** Inside Telegram the wallet is the bot's, so nothing signs in the browser. */
function MiniBridge({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string>();
  useEffect(() => {
    fetchMe().then((me) => setAddress(me.address ?? undefined)).catch(() => {});
  }, []);
  const value = useMemo<WalletState>(
    () => ({
      configured: true,
      ready: !!address,
      miniApp: true,
      address,
      login() {},
      logout() {},
      actions: miniActions,
      getSigner: async () => ({ address: address ?? "", signTypedData: unavailable, signMessage: unavailable, sendTransaction: unavailable }),
    }),
    [address],
  );
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

const WalletContext = createContext<WalletState>(notConfigured);
export const useWallet = () => useContext(WalletContext);

function PrivyBridge({ children }: { children: ReactNode }) {
  const { ready, authenticated, login, logout } = usePrivy();
  const { wallets } = useWallets();
  const wallet = authenticated ? wallets[0] : undefined;

  const value = useMemo<WalletState>(() => {
    const state: WalletState = {
      configured: true,
      ready,
      address: wallet?.address,
      login,
      logout: () => void logout(),
      async getSigner(name = "base") {
        if (!wallet) throw new Error("Connect a wallet first");
        const chain = CHAINS[name];
        if (!chain) throw new Error(`${name} isn't supported yet`);
        await wallet.switchChain(chain.id);
        const account = wallet.address as Hex;
        const client = createWalletClient({ account, chain, transport: custom(await wallet.getEthereumProvider()) });
        return {
          address: account,
          signTypedData: (typedData) => client.signTypedData(JSON.parse(typedData)),
          signMessage: (message) => client.signMessage({ message }),
          async sendTransaction({ to, data }) {
            const hash = await client.sendTransaction({ to: to as Hex, data: data as Hex });
            const receipt = await createPublicClient({ chain, transport: http() }).waitForTransactionReceipt({ hash });
            if (receipt.status !== "success") throw new Error(`Transaction reverted: ${hash}`);
            return hash;
          },
        };
      },
      actions: browserActions((chain) => state.getSigner(chain)),
    };
    return state;
  }, [ready, wallet, login, logout]);
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const [miniApp, setMiniApp] = useState(false);
  useEffect(() => {
    try {
      setMiniApp(sessionStorage.getItem("miniApp") === "1");
    } catch {}
  }, []);
  if (miniApp) return <MiniBridge>{children}</MiniBridge>;
  if (!appId) return <>{children}</>;
  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ["wallet", "email"],
        defaultChain: base,
        supportedChains: Object.values(CHAINS),
        appearance: { theme: "dark", accentColor: "#C4F250" },
        embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" } },
      }}
    >
      <PrivyBridge>{children}</PrivyBridge>
    </PrivyProvider>
  );
}
