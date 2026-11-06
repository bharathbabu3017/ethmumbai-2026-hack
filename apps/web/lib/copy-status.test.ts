import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_COPY_SETTINGS } from "@flashmob/flash";
import { copyStatus } from "./copy-status";

const settings = { ...DEFAULT_COPY_SETTINGS, enabled: true, sizing: "fixed" as const, amountUsd: 5, dailyCapUsd: 20 };
const on = { settings, approved: true, masterOn: true, paused: false, usdc: 50, eth: 0.001, spent: 0 };

test("says exactly which state it's in", () => {
  assert.equal(copyStatus(on).label, "Active");
  assert.equal(copyStatus({ ...on, settings: { ...settings, enabled: false } }).label, "Off");
  assert.equal(copyStatus({ ...on, paused: true }).label, "Paused");
  assert.equal(copyStatus({ ...on, masterOn: false }).label, "Stopped");
  assert.equal(copyStatus({ ...on, approved: false }).label, "Needs approval");
  assert.equal(copyStatus({ ...on, spent: 20 }).label, "Daily limit reached");
  assert.equal(copyStatus({ ...on, eth: 0 }).label, "Needs gas");
});

test("never says Active when the worker would skip the copy", () => {
  assert.equal(copyStatus({ ...on, usdc: 3.89 }).label, "Needs funds");
  assert.equal(copyStatus({ ...on, usdc: 3.89, settings: { ...settings, sizing: "percent", percentOfBalance: 5 } }).label, "Amount too small");
  assert.equal(copyStatus({ ...on, usdc: 3.89, settings: { ...settings, amountUsd: 2 } }).label, "Active");
});

test("off beats everything, so a stopped copy never looks broken", () => {
  assert.equal(copyStatus({ ...on, settings: { ...settings, enabled: false }, usdc: 0, paused: true }).tone, "off");
});
