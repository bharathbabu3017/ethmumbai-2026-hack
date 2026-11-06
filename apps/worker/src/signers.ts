import type { schema } from "@flashmob/db";
import { createBotSigner, createPrivySigner, type createPrivy } from "@flashmob/signer";
import { base } from "viem/chains";

export interface PrivyAccess {
  client: ReturnType<typeof createPrivy>;
  authorizationKey: string;
}

export interface SignerDeps {
  masterKey: Buffer;
  rpcUrl?: string;
  privy?: PrivyAccess;
}

type Wallet = typeof schema.wallets.$inferSelect;

/** A signer for a wallet the server may use: an approved Privy wallet, or an older generated one. */
export function signerFor({ masterKey, rpcUrl, privy }: SignerDeps, wallet: Wallet, userId: string) {
  if (wallet.type === "embedded") {
    if (!privy || !wallet.privyWalletId || !wallet.delegated) throw new Error("This wallet hasn't approved Flashmob yet.");
    return createPrivySigner(privy.client.wallets().ethereum(), wallet.privyWalletId, wallet.address, privy.authorizationKey, base, rpcUrl);
  }
  if (wallet.type !== "bot" || !wallet.encryptedKey) throw new Error("This wallet can't be used here.");
  return createBotSigner(wallet.encryptedKey, masterKey, userId, base, rpcUrl);
}
