import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { decryptKey, encryptKey, parseMasterKey } from "./crypto";
import { createBotSigner, generateBotWallet } from "./server";

const master = randomBytes(32);
const pk = "0x" + "ab".repeat(32);

test("round trips for the right owner", () => {
  assert.equal(decryptKey(encryptKey(pk, master, "user-1"), master, "user-1"), pk);
});

test("never stores the key in the clear and never repeats ciphertext", () => {
  const a = encryptKey(pk, master, "user-1");
  assert.ok(!a.includes(pk) && !a.includes(pk.slice(2)));
  assert.notEqual(a, encryptKey(pk, master, "user-1"));
});

test("fails for another owner, the wrong master key, or tampering", () => {
  const enc = encryptKey(pk, master, "user-1");
  assert.throws(() => decryptKey(enc, master, "user-2"));
  assert.throws(() => decryptKey(enc, randomBytes(32), "user-1"));
  const parts = enc.split(":");
  const body = Buffer.from(parts[3]!, "base64");
  body[0]! ^= 1;
  parts[3] = body.toString("base64");
  assert.throws(() => decryptKey(parts.join(":"), master, "user-1"));
});

test("rejects a weak master key", () => {
  assert.throws(() => parseMasterKey(undefined));
  assert.throws(() => parseMasterKey("abcd"));
  assert.equal(parseMasterKey("00".repeat(32)).length, 32);
});

test("a generated wallet decrypts to a signer with the same address", async () => {
  const w = generateBotWallet(master, "user-1");
  const signer = createBotSigner(w.encryptedKey, master, "user-1", base);
  assert.equal(signer.address, w.address);
  assert.equal(privateKeyToAccount(decryptKey(w.encryptedKey, master, "user-1") as `0x${string}`).address, w.address);
  assert.match(await signer.signMessage("hello"), /^0x[0-9a-f]{130}$/);
});
