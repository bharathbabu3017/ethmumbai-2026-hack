import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_AGE_SECONDS = 3600;

/** Checks Telegram's signature on Mini App launch data, as described in Telegram's Mini Apps docs. */
export function verifyInitData(initData: string, botToken: string, now = Date.now()) {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash || !/^[0-9a-f]{64}$/.test(hash)) return null;
  params.delete("hash");
  const check = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = createHmac("sha256", secret).update(check).digest();
  if (!timingSafeEqual(expected, Buffer.from(hash, "hex"))) return null;

  const age = now / 1000 - Number(params.get("auth_date"));
  if (!(age >= -60 && age <= MAX_AGE_SECONDS)) return null;
  try {
    const user = JSON.parse(params.get("user") ?? "");
    return typeof user.id === "number" ? { id: user.id as number } : null;
  } catch {
    return null;
  }
}
