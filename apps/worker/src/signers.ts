import type { schema } from "@flashmob/db";
import { createPrivySigner, type createPrivy } from "@flashmob/signer";
import { base } from "viem/chains";

export interface PrivyAccess {
  client: Pick<ReturnType<typeof createPrivy>, "wallets">;
  authorizationKey: string;
}

export interface SignerDeps {
  privy: PrivyAccess;
  rpcUrl?: string;
}

type Wallet = typeof schema.wallets.$inferSelect;

/** A signer for a Privy wallet the user has approved. Nothing else can be signed for on the server. */
export function signerFor({ privy, rpcUrl }: SignerDeps, wallet: Wallet) {
  if (wallet.type !== "embedded" || !wallet.privyWalletId || !wallet.delegated) throw new Error("This wallet hasn't approved Flashmob yet.");
  return createPrivySigner(privy.client.wallets().ethereum(), wallet.privyWalletId, wallet.address, privy.authorizationKey, base, rpcUrl);
}
