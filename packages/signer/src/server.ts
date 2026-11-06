import { createPublicClient, createWalletClient, http, type Chain, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { decryptKey, encryptKey } from "./crypto";

export interface OrderSigner {
  address: `0x${string}`;
  signTypedData(typedData: string): Promise<Hex>;
  signMessage(message: string): Promise<Hex>;
  /** Sends a transaction and resolves once it is mined. */
  sendTransaction(tx: { to: string; data: string }): Promise<Hex>;
}

export function generateBotWallet(masterKey: Buffer, owner: string) {
  const privateKey = generatePrivateKey();
  return { address: privateKeyToAccount(privateKey).address, encryptedKey: encryptKey(privateKey, masterKey, owner) };
}

export function createPrivateKeySigner(privateKey: Hex, chain: Chain, rpcUrl?: string): OrderSigner {
  const account = privateKeyToAccount(privateKey);
  const transport = http(rpcUrl);
  const wallet = createWalletClient({ account, chain, transport });
  const reader = createPublicClient({ chain, transport });
  return {
    address: account.address,
    signTypedData: (typedData) => account.signTypedData(JSON.parse(typedData)),
    signMessage: (message) => account.signMessage({ message }),
    async sendTransaction({ to, data }) {
      const hash = await wallet.sendTransaction({ to: to as Hex, data: data as Hex, value: 0n });
      const receipt = await reader.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error(`Transaction reverted: ${hash}`);
      return hash;
    },
  };
}

export function createBotSigner(encryptedKey: string, masterKey: Buffer, owner: string, chain: Chain, rpcUrl?: string) {
  return createPrivateKeySigner(decryptKey(encryptedKey, masterKey, owner) as Hex, chain, rpcUrl);
}
