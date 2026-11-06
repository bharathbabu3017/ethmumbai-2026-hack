import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { activeAgents, claimJobs, createAgent, getOrCreateWalletUser, listDecisions, schema, setAgentStatus, type Db } from "@flashmob/db";
import { migrationsFolder } from "@flashmob/db/migrations";
import { USDC_BASE, type AgentDecision, type AgentSettings, type FlashClient } from "@flashmob/flash";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { checkAgent, type AgentDeps } from "./agents";
import { runJob } from "./jobs";
import { fakePrivy } from "./test-helpers";

const WETH = "0x4200000000000000000000000000000000000006";
const settings: AgentSettings = { strategy: "dip", style: "", tokens: [WETH], budgetUsd: 5, maxTradeUsd: 2, everyMinutes: 60 };
const buy: AgentDecision = { action: "limit_buy", token: "WETH", amountUsd: 2, limitPrice: 2150, stopPrice: 2050, targetPrice: 2400, reason: "A dip." };

let db: Db;
let agentId: string;
let usdc: string;
let eth: string;
let asked: number;
let answer: AgentDecision;
let submits: any[];

const flash = {
  balances: async () => ({ balances: [{ chain: "base", address: USDC_BASE, balance: usdc, isNative: false }, { chain: "base", address: "0xeee", balance: eth, isNative: true }] }),
  listOrders: async () => ({ orders: [] }),
  quote: async () => ({ quoteId: "q", from: { amount: "2", notional: "2" }, to: { amount: "0.001" }, fees: {}, attachedBracket: { evm: { approveTx: null, permitTypedData: "", orderTypedData: "{}" } }, evm: { approveTx: null, permitTypedData: "", orderTypedData: JSON.stringify({ domain: {}, types: {}, primaryType: "Order", message: {} }) } }),
  submitOrder: async (b: any) => (submits.push(b), { orderId: `placed-${submits.length}` }),
} as unknown as FlashClient;
const searchFlash = { search: async () => ({ assets: [{ symbol: "WETH", price: "2221", priceChange24h: "-0.06" }] }) } as unknown as FlashClient;
const deps = (): AgentDeps => ({ db, flash, searchFlash, pause: async () => {}, ask: async () => (asked++, answer) });
const current = async () => (await activeAgents(db)).find((a) => a.id === agentId)!;
const check = async () => checkAgent(deps(), await current());
const log = () => listDecisions(db, agentId);
const drain = async () => { for (const job of await claimJobs(db)) await runJob({ db, flash, privy: fakePrivy, feeBps: "0" }, job); };

beforeEach(async () => {
  const pg = drizzle(new PGlite(), { schema });
  await migrate(pg, { migrationsFolder });
  db = pg as unknown as Db;
  usdc = "20"; eth = "0.001"; asked = 0; answer = buy; submits = [];
  const ownerId = await getOrCreateWalletUser(db, "0xOwner");
  agentId = (await createAgent(db, { ownerId, name: "Dip Hunter", settings, address: "0x00000000000000000000000000000000000000aa", privyWalletId: "w1" })).id;
});

test("an unfunded agent doesn't run, and never calls the model", async () => {
  usdc = "0";
  await check();
  assert.equal(asked, 0);
  assert.equal((await current()).status, "funding");
});

test("funds start it, and a good decision is logged and placed from its own wallet", async () => {
  await check();
  assert.equal((await current()).status, "running");
  assert.equal((await log())[0]?.status, "placed");
  await drain();
  assert.deepEqual([submits.length, submits[0].funderAddress], [1, "0x00000000000000000000000000000000000000aa"]);
});

test("doing nothing is logged, and places nothing", async () => {
  answer = { action: "do_nothing", reason: "No dip." };
  await check();
  await drain();
  assert.deepEqual([(await log())[0]?.status, (await log())[0]?.reason, submits.length], ["idle", "No dip.", 0]);
});

test("a decision over its limits is refused in code and logged", async () => {
  answer = { ...buy, amountUsd: 50 };
  await check();
  await drain();
  const [row] = await log();
  assert.equal(row?.status, "refused");
  assert.match(row?.note ?? "", /over the/);
  assert.equal(submits.length, 0);
});

test("the budget is used up across checks", async () => {
  await setAgentStatus(db, agentId, "running");
  for (let i = 0; i < 3; i++) {
    await check();
    await db.update(schema.agents).set({ lastCheckAt: new Date(0) });
  }
  const rows = await log();
  assert.deepEqual(rows.map((r) => r.status).reverse(), ["placed", "placed", "refused"]);
});

test("pausing after a decision was queued stops the order", async () => {
  await check();
  await setAgentStatus(db, agentId, "paused");
  await drain();
  assert.equal(submits.length, 0);
  assert.equal((await log())[0]?.status, "failed");
});

test("two workers can't run the same check", async () => {
  await setAgentStatus(db, agentId, "running");
  const seen = await current();
  await Promise.all([checkAgent(deps(), seen), checkAgent(deps(), seen)]);
  assert.equal(asked, 1);
});
