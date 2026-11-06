import assert from "node:assert/strict";
import { test } from "node:test";
import { isValidLoginMessage, loginMessage } from "./login";

const now = Date.parse("2026-11-06T10:00:00Z");
const msg = loginMessage("flashmob.app", "0xabc", "2026-11-06T09:59:00Z");

test("accepts a fresh message for this site and wallet", () => {
  assert.ok(isValidLoginMessage(msg, "flashmob.app", "0xabc", now));
});

test("rejects another site, another wallet, an old message, or an altered one", () => {
  assert.equal(isValidLoginMessage(msg, "evil.example", "0xabc", now), false);
  assert.equal(isValidLoginMessage(msg, "flashmob.app", "0xdef", now), false);
  assert.equal(isValidLoginMessage(msg, "flashmob.app", "0xabc", now + 10 * 60 * 1000), false);
  assert.equal(isValidLoginMessage(msg + "x", "flashmob.app", "0xabc", now), false);
});
