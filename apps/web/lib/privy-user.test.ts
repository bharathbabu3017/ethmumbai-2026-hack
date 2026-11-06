import assert from "node:assert/strict";
import { test } from "node:test";
import { identityFrom } from "./privy-user";

test("finds the embedded wallet, outside wallets and Telegram", () => {
  const identity = identityFrom({
    id: "did:privy:1",
    linked_accounts: [
      { type: "wallet", chain_type: "ethereum", wallet_client_type: "privy", id: "w1", address: "0xEmb", delegated: true },
      { type: "wallet", chain_type: "ethereum", wallet_client_type: "metamask", address: "0xMeta" },
      { type: "wallet", chain_type: "solana", wallet_client_type: "privy", id: "w2", address: "So1" },
      { type: "telegram", telegram_user_id: "42", username: "ana" },
      { type: "email", address: "a@b.c" },
    ],
  });
  assert.deepEqual(identity, {
    privyId: "did:privy:1", telegramId: 42, telegramUsername: "ana",
    embedded: { walletId: "w1", address: "0xEmb", delegated: true }, externalAddresses: ["0xMeta"],
  });
});

test("a user with no wallet or Telegram yet is fine", () => {
  assert.deepEqual(identityFrom({ id: "d", linked_accounts: [] }), { privyId: "d", telegramId: undefined, telegramUsername: undefined, embedded: undefined, externalAddresses: [] });
});

test("an embedded wallet isn't approved unless Privy says so", () => {
  const { embedded } = identityFrom({ id: "d", linked_accounts: [{ type: "wallet", chain_type: "ethereum", wallet_client_type: "privy", id: "w", address: "0x1" }] });
  assert.equal(embedded!.delegated, false);
});
