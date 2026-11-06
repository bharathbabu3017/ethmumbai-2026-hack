import assert from "node:assert/strict";
import { test } from "node:test";
import { agentSettingsError, type AgentSettings } from "./agents";

const good: AgentSettings = { strategy: "dip", style: "", tokens: ["0x4200000000000000000000000000000000000006"], budgetUsd: 25, maxTradeUsd: 2, everyMinutes: 60 };

test("sensible settings pass", () => assert.equal(agentSettingsError(good), null));

test("limits that can't protect anyone are refused", () => {
  assert.equal(agentSettingsError({ ...good, tokens: [] }), "Pick at least one token.");
  assert.equal(agentSettingsError({ ...good, tokens: ["weth"] }), "One of the tokens isn't a valid address.");
  assert.equal(agentSettingsError({ ...good, maxTradeUsd: 0.5 }), "Max per trade must be at least $1.");
  assert.equal(agentSettingsError({ ...good, budgetUsd: 1 }), "The budget must be at least the max per trade.");
  assert.equal(agentSettingsError({ ...good, everyMinutes: 1 }), "Pick how often it checks the market.");
  assert.equal(agentSettingsError({ ...good, strategy: "yolo" as never }), "Pick a strategy.");
});
