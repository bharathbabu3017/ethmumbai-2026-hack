"use client";

import { PrivyProvider, usePrivy, useWallets } from "@privy-io/react-auth";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { createWalletClient, custom, type Hex } from "viem";
import { base } from "viem/chains";

export interface BrowserSigner {
  address: string;
  signTypedData(typedData: string): Promise<string>;
  signMessage(message: string): Promise<string>;
  sendTransaction(tx: { to: string; data: string }): Promise<string>;
}

interface WalletState {
  configured: boolean;
  ready: boolean;
  address?: string;
  login(): void;
  logout(): void;
  getSigner(): Promise<BrowserSigner>;
}

const notConfigured: WalletState = {
  configured: false,
  ready: true,
  login() {},
  logout() {},
  getSigner: () => Promise.reject(new Error("Wallet login isn't set up yet")),
};

const WalletContext = createContext<WalletState>(notConfigured);
export const useWallet = () => useContext(WalletContext);

function PrivyBridge({ children }: { children: ReactNode }) {
  const { ready, authenticated, login, logout } = usePrivy();
  const { wallets } = useWallets();
  const wallet = authenticated ? wallets[0] : undefined;

  const value = useMemo<WalletState>(
    () => ({
      configured: true,
      ready,
      address: wallet?.address,
      login,
      logout: () => void logout(),
      async getSigner() {
        if (!wallet) throw new Error("Connect a wallet first");
        await wallet.switchChain(base.id);
        const account = wallet.address as Hex;
        const client = createWalletClient({ account, chain: base, transport: custom(await wallet.getEthereumProvider()) });
        return {
          address: account,
          signTypedData: (typedData) => client.signTypedData(JSON.parse(typedData)),
          signMessage: (message) => client.signMessage({ message }),
          sendTransaction: ({ to, data }) => client.sendTransaction({ to: to as Hex, data: data as Hex }),
        };
      },
    }),
    [ready, wallet, login, logout],
  );
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  if (!appId) return <>{children}</>;
  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ["wallet", "email"],
        defaultChain: base,
        supportedChains: [base],
        appearance: { theme: "dark", accentColor: "#C4F250" },
        embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" } },
      }}
    >
      <PrivyBridge>{children}</PrivyBridge>
    </PrivyProvider>
  );
}
