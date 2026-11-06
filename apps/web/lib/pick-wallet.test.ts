import assert from "node:assert/strict";
import { test } from "node:test";
import { pickWallet } from "./pick-wallet";

const embedded = { address: "0xEmb", walletClientType: "privy" };
const phantom = { address: "0xPhantom", walletClientType: "phantom" };

test("an extension that isn't linked is ignored for an email login", () => {
  assert.equal(pickWallet([phantom, embedded], ["0xemb"]), embedded);
});

test("a wallet the user logged in with wins over their embedded one", () => {
  assert.equal(pickWallet([embedded, phantom], ["0xEmb", "0xPHANTOM"]), phantom);
});

test("nothing is picked if no connected wallet belongs to the user", () => {
  assert.equal(pickWallet([phantom], ["0xEmb"]), undefined);
});
