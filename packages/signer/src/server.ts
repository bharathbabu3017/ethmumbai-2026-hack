import { createPublicClient, createWalletClient, http, type Chain, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export interface OrderSigner {
  address: `0x${string}`;
  signTypedData(typedData: string): Promise<Hex>;
  signMessage(message: string): Promise<Hex>;
  /** Sends a transaction and resolves once it is mined. */
  sendTransaction(tx: { to: string; data: string; value?: bigint }): Promise<Hex>;
}

/** Signs with a local key. Only the spike script uses this. */
export function createPrivateKeySigner(privateKey: Hex, chain: Chain, rpcUrl?: string): OrderSigner {
  const account = privateKeyToAccount(privateKey);
  const transport = http(rpcUrl);
  const wallet = createWalletClient({ account, chain, transport });
  const reader = createPublicClient({ chain, transport });
  return {
    address: account.address,
    signTypedData: (typedData) => account.signTypedData(JSON.parse(typedData)),
    signMessage: (message) => account.signMessage({ message }),
    async sendTransaction({ to, data, value = 0n }) {
      const hash = await wallet.sendTransaction({ to: to as Hex, data: data as Hex, value });
      const receipt = await reader.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error(`Transaction reverted: ${hash}`);
      return hash;
    },
  };
}
