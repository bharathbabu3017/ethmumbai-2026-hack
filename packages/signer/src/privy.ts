import { PrivyClient } from "@privy-io/node";
import { createPublicClient, http, type Chain, type Hex } from "viem";
import type { OrderSigner } from "./server";

export interface PrivyConfig {
  appId: string;
  appSecret: string;
  authorizationKey: string;
}

export const createPrivy = ({ appId, appSecret }: PrivyConfig) => new PrivyClient({ appId, appSecret });

/** The dashboard shows the key with a prefix, but the SDK wants the bare base64 key. */
const bareKey = (key: string) => key.replace(/^wallet-auth:/, "");

type EthereumApi = Pick<ReturnType<ReturnType<PrivyClient["wallets"]>["ethereum"]>, "signTypedData" | "signMessage" | "sendTransaction">;

/** Signs with a user's Privy wallet. Privy only allows this after the user has approved our signer. */
export function createPrivySigner(api: EthereumApi, walletId: string, address: string, authorizationKey: string, chain: Chain, rpcUrl?: string): OrderSigner {
  const authorization_context = { authorization_private_keys: [bareKey(authorizationKey)] };
  const reader = createPublicClient({ chain, transport: http(rpcUrl) });
  return {
    address: address as Hex,
    async signTypedData(typedData) {
      const { domain, types, primaryType, message } = JSON.parse(typedData);
      const { signature } = await api.signTypedData(walletId, { params: { typed_data: { domain, types, primary_type: primaryType, message } }, authorization_context });
      return signature as Hex;
    },
    async signMessage(message) {
      const { signature } = await api.signMessage(walletId, { message, authorization_context });
      return signature as Hex;
    },
    async sendTransaction({ to, data, value }) {
      const { hash } = await api.sendTransaction(walletId, { caip2: `eip155:${chain.id}`, params: { transaction: { to, data, ...(value ? { value: `0x${value.toString(16)}` } : {}) } }, authorization_context });
      const receipt = await reader.waitForTransactionReceipt({ hash: hash as Hex });
      if (receipt.status !== "success") throw new Error(`Transaction reverted: ${hash}`);
      return hash as Hex;
    },
  };
}
