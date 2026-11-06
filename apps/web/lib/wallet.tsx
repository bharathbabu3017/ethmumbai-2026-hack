"use client";

import { PrivyProvider, useCreateWallet, usePrivy, useSigners, useWallets } from "@privy-io/react-auth";
import { batchCancelMessage, buildUpdate, cancelMessage, submitPrepared, type EditableOrder, type OrderRequest, type OrderStep, type QuoteResponse } from "@flashmob/flash";
import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from "react";
import { createPublicClient, createWalletClient, custom, http, type Hex } from "viem";
import { postJson } from "./account";
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

/** Everything that needs the wallet's approval. */
export interface WalletActions {
  place(request: OrderRequest, quote: QuoteResponse, chain?: string, onStep?: (step: OrderStep) => void): Promise<{ orderId: string }>;
  cancel(orderId: string): Promise<void>;
  cancelMany(orderIds: string[]): Promise<void>;
  update(orderId: string, order: EditableOrder, next: Record<string, string>): Promise<void>;
}

interface WalletState {
  configured: boolean;
  ready: boolean;
  address?: string;
  /** Lets the server sign with this user's embedded wallet, for the bot and auto-copy. */
  approveServerAccess?(): Promise<void>;
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
    place: async (request, quote, chain, onStep) => submitPrepared(flash, await getSigner(chain), request, quote, onStep),
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

const WalletContext = createContext<WalletState>(notConfigured);
export const useWallet = () => useContext(WalletContext);

/** Turned on after Telegram is enabled in the Privy dashboard. */
export const TELEGRAM_LOGIN = process.env.NEXT_PUBLIC_PRIVY_TELEGRAM === "true";
const SIGNER_ID = process.env.NEXT_PUBLIC_PRIVY_SIGNER_ID;

function PrivyBridge({ children }: { children: ReactNode }) {
  const { ready, authenticated, login, logout, getAccessToken } = usePrivy();
  const { wallets } = useWallets();
  const { addSigners } = useSigners();
  const { createWallet } = useCreateWallet();
  // Someone who connected their own wallet trades from it. Everyone else uses their embedded wallet.
  const embedded = wallets.find((w) => w.walletClientType === "privy");
  const wallet = authenticated ? wallets.find((w) => w.walletClientType !== "privy") ?? embedded : undefined;

  // Tells our server who this is, using Privy's verified token.
  const sync = useCallback(async () => {
    const accessToken = await getAccessToken();
    if (accessToken) await postJson("/api/privy/sync", { accessToken, active: wallet?.address });
  }, [getAccessToken, wallet?.address]);

  useEffect(() => {
    if (authenticated && wallet) sync().catch(() => {});
  }, [authenticated, wallet, sync]);

  const approveServerAccess = useCallback(async () => {
    if (!SIGNER_ID) throw new Error("Privy's server signer isn't set up yet");
    const address = embedded?.address ?? (await createWallet()).address;
    await addSigners({ address, signers: [{ signerId: SIGNER_ID, policyIds: [] }] });
    await sync();
  }, [embedded?.address, createWallet, addSigners, sync]);

  const value = useMemo<WalletState>(() => {
    const state: WalletState = {
      configured: true,
      ready,
      address: wallet?.address,
      approveServerAccess,
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
  }, [ready, wallet, login, logout, approveServerAccess]);
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  if (!appId) return <>{children}</>;
  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: TELEGRAM_LOGIN ? ["wallet", "email", "telegram"] : ["wallet", "email"],
        defaultChain: base,
        supportedChains: Object.values(CHAINS),
        appearance: { theme: "dark", accentColor: "#C4F250" },
        embeddedWallets: { ethereum: { createOnLogin: "all-users" } },
      }}
    >
      <PrivyBridge>{children}</PrivyBridge>
    </PrivyProvider>
  );
}
