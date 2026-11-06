import assert from "node:assert/strict";
import { test } from "node:test";
import { copyStatus } from "./copy-status";

const on = { enabled: true, masterOn: true, paused: false, amountUsd: 5, usdc: 50, eth: 0.001, spent: 0, dailyCapUsd: 20 };

test("says exactly which state it's in", () => {
  assert.equal(copyStatus(on).label, "Active");
  assert.equal(copyStatus({ ...on, enabled: false }).label, "Off");
  assert.equal(copyStatus({ ...on, paused: true }).label, "Paused");
  assert.equal(copyStatus({ ...on, masterOn: false }).label, "Stopped");
  assert.equal(copyStatus({ ...on, spent: 20 }).label, "Daily limit reached");
  assert.equal(copyStatus({ ...on, usdc: 0 }).label, "Needs funds");
  assert.equal(copyStatus({ ...on, eth: 0 }).label, "Needs gas");
});

test("off beats everything, so a stopped copy never looks broken", () => {
  assert.equal(copyStatus({ ...on, enabled: false, usdc: 0, paused: true }).tone, "off");
});
