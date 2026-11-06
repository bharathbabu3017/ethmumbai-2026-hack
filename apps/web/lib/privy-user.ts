import type { PrivyIdentity } from "@flashmob/db";

interface LinkedAccount {
  type: string;
  id?: string | null;
  address?: string;
  chain_type?: string;
  wallet_client_type?: string;
  delegated?: boolean;
  telegram_user_id?: string;
  username?: string | null;
}

/** Reads what we need from a Privy user. Addresses here are proven by Privy's own login, so no extra signature is needed. */
export function identityFrom(user: { id: string; linked_accounts: unknown[] }): PrivyIdentity {
  const accounts = user.linked_accounts as LinkedAccount[];
  const evm = accounts.filter((a) => a.type === "wallet" && (a.chain_type === "ethereum" || a.chain_type === undefined) && a.address);
  const embedded = evm.find((a) => a.wallet_client_type === "privy" && a.id);
  const telegram = accounts.find((a) => a.type === "telegram");
  return {
    privyId: user.id,
    telegramId: telegram?.telegram_user_id ? Number(telegram.telegram_user_id) : undefined,
    telegramUsername: telegram?.username ?? undefined,
    embedded: embedded ? { walletId: embedded.id!, address: embedded.address!, delegated: !!embedded.delegated } : undefined,
    externalAddresses: evm.filter((a) => a !== embedded && a.wallet_client_type !== "privy").map((a) => a.address!),
  };
}
