"use client";

import { PrivyProvider, usePrivy, useWallets } from "@privy-io/react-auth";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { createPublicClient, createWalletClient, custom, http, type Hex } from "viem";
import { arbitrum, base, mainnet, optimism, polygon, type Chain } from "viem/chains";

const CHAINS: Record<string, Chain> = { base, ethereum: mainnet, arbitrum, optimism, polygon };

export interface BrowserSigner {
  address: string;
  signTypedData(typedData: string): Promise<string>;
  signMessage(message: string): Promise<string>;
  /** Resolves once the transaction is mined, so an order can safely follow it. */
  sendTransaction(tx: { to: string; data: string }): Promise<string>;
}

interface WalletState {
  configured: boolean;
  ready: boolean;
  address?: string;
  login(): void;
  logout(): void;
  /** A signer on the given chain, which is Base unless an order is paid from elsewhere. */
  getSigner(chain?: string): Promise<BrowserSigner>;
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
        supportedChains: Object.values(CHAINS),
        appearance: { theme: "dark", accentColor: "#C4F250" },
        embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" } },
      }}
    >
      <PrivyBridge>{children}</PrivyBridge>
    </PrivyProvider>
  );
}
