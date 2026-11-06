import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { safeNext } from "./next-path";
import { verifyInitData } from "./telegram";

const token = "123:abc";
const now = 1_800_000_000_000;

function sign(fields: Record<string, string>, secretToken = token) {
  const check = Object.entries(fields).map(([k, v]) => `${k}=${v}`).sort().join("\n");
  const secret = createHmac("sha256", "WebAppData").update(secretToken).digest();
  const hash = createHmac("sha256", secret).update(check).digest("hex");
  return new URLSearchParams({ ...fields, hash }).toString();
}
const fields = { auth_date: String(now / 1000), user: JSON.stringify({ id: 42 }), query_id: "q" };

test("accepts data signed for this bot", () => {
  assert.deepEqual(verifyInitData(sign(fields), token, now), { id: 42 });
});

test("rejects another bot's signature, tampering, and old data", () => {
  assert.equal(verifyInitData(sign(fields, "999:other"), token, now), null);
  assert.equal(verifyInitData(sign(fields).replace("42", "43"), token, now), null);
  assert.equal(verifyInitData(sign(fields), token, now + 2 * 3600_000), null);
  assert.equal(verifyInitData("user=x", token, now), null);
  assert.equal(verifyInitData(`${sign(fields).replace(/hash=[^&]+/, "hash=zz")}`, token, now), null);
});

test("next only allows paths on this site", () => {
  assert.equal(safeNext("/trades/1"), "/trades/1");
  for (const bad of ["https://evil.example", "//evil.example", "/\\\\evil.example", null, ""]) assert.equal(safeNext(bad), "/home");
});
