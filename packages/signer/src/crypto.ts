import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";

export function parseMasterKey(hex: string | undefined): Buffer {
  if (!hex || !/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error("WALLET_MASTER_KEY must be 32 bytes of hex");
  return Buffer.from(hex, "hex");
}

// `owner` is bound in as associated data, so a ciphertext copied onto another user's row will not decrypt.
export function encryptKey(privateKey: string, masterKey: Buffer, owner: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", masterKey, iv);
  cipher.setAAD(Buffer.from(owner));
  const body = Buffer.concat([cipher.update(privateKey, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64"), cipher.getAuthTag().toString("base64"), body.toString("base64")].join(":");
}

export function decryptKey(encrypted: string, masterKey: Buffer, owner: string): string {
  const [version, iv, tag, body] = encrypted.split(":");
  if (version !== VERSION || !iv || !tag || !body) throw new Error("Unrecognised encrypted key format");
  const decipher = createDecipheriv("aes-256-gcm", masterKey, Buffer.from(iv, "base64"));
  decipher.setAAD(Buffer.from(owner));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64")), decipher.final()]).toString("utf8");
}
