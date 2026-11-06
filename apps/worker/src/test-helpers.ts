import { getOrCreateTelegramAccount, syncPrivyUser, getTradingWallet, type Db } from "@flashmob/db";
import type { PrivyAccess } from "./signers";

/** Stands in for Privy, which would sign in its secure enclave. */
export const fakePrivy = {
  authorizationKey: "test-key",
  client: {
    wallets: () => ({
      ethereum: () => ({
        signTypedData: async () => ({ signature: "0xsigned" }),
        signMessage: async () => ({ signature: "0xsigned" }),
        sendTransaction: async () => ({ hash: "0xhash" }),
      }),
    }),
  },
} as unknown as PrivyAccess;

/** A Telegram user with an approved Privy wallet. */
export async function approvedUser(db: Db, telegramId: number) {
  const user = await getOrCreateTelegramAccount(db, { id: telegramId });
  const address = `0x${telegramId.toString(16).padStart(40, "a")}`;
  await syncPrivyUser(db, { privyId: `did:${telegramId}`, telegramId, embedded: { walletId: `pw-${telegramId}`, address, delegated: true }, externalAddresses: [] });
  return { user, wallet: (await getTradingWallet(db, user.id))! };
}
