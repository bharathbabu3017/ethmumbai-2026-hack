import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { activeAgents, claimJobs, createAgent, getOrCreateWalletUser, listDecisions, schema, setAgentStatus, type Db } from "@flashmob/db";
import { migrationsFolder } from "@flashmob/db/migrations";
import { USDC_BASE, type AgentDecision, type AgentPlan, type AgentSettings, type FlashClient, type Indicators, type Judgment } from "@flashmob/flash";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { checkAgent, fundsProblem, protectPositions, type AgentDeps } from "./agents";
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

let held: string;
let open: any[];
let market: Indicators;
let verdict: Judgment;
let judged: number;

const flash = {
  balances: async () => ({ balances: [{ chain: "base", address: USDC_BASE, balance: usdc, isNative: false, notional: usdc }, { chain: "base", address: "0xeee", balance: eth, isNative: true, notional: "1" }, { chain: "base", address: WETH, symbol: "WETH", balance: held, isNative: false, notional: String(Number(held) * 2000) }] }),
  listOrders: async () => ({ orders: open }),
  quote: async () => ({ quoteId: "q", from: { amount: "2", notional: "2" }, to: { amount: "0.001" }, fees: {}, attachedBracket: { evm: { approveTx: null, permitTypedData: "", orderTypedData: "{}" } }, evm: { approveTx: null, permitTypedData: "", orderTypedData: JSON.stringify({ domain: {}, types: {}, primaryType: "Order", message: {} }) } }),
  submitOrder: async (b: any) => (submits.push(b), { orderId: `placed-${submits.length}` }),
} as unknown as FlashClient;
const searchFlash = { search: async () => ({ assets: [{ symbol: "WETH", price: "2221", priceChange24h: "-0.06" }] }) } as unknown as FlashClient;
const deps = (): AgentDeps => ({ db, flash, searchFlash, pause: async () => {}, ask: async () => (asked++, answer), readMarket: async () => ({ "1h": market }), judge: async () => (judged++, verdict) });
const current = async () => (await activeAgents(db)).find((a) => a.id === agentId)!;
const check = async () => checkAgent(deps(), await current());
const log = () => listDecisions(db, agentId);
const drain = async () => { for (const job of await claimJobs(db)) await runJob({ db, flash, privy: fakePrivy, feeBps: "0" }, job); };

beforeEach(async () => {
  const pg = drizzle(new PGlite(), { schema });
  await migrate(pg, { migrationsFolder });
  db = pg as unknown as Db;
  usdc = "20"; eth = "0.001"; asked = 0; answer = buy; submits = []; held = "0"; open = []; judged = 0;
  market = { rsi: 28, sma20: 2300, sma50: 2300, high7d: 2400, low7d: 2100, volumeRatio: 1, volatility: 1 };
  verdict = { pass: true, reason: "No bad news.", sources: [{ title: "A", url: "https://a.com" }] };
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

const plan: AgentPlan = { summary: "Buy dips.", rules: [{ metric: "rsi", op: "below", value: 30 }], entry: { type: "ladder", rungs: 3, stepPercent: 1 }, exit: { stopPercent: 5, targetPercent: 8, trailPercent: 4 } };
let made = 0;
const custom = async (p: AgentPlan, limits: Partial<AgentSettings> = {}) => {
  const ownerId = await getOrCreateWalletUser(db, "0xOwner2");
  made++;
  agentId = (await createAgent(db, { ownerId, name: `Custom ${made}`, settings: { ...settings, strategy: "custom", budgetUsd: 50, maxTradeUsd: 9, plan: p, ...limits }, address: `0x${String(made).padStart(40, "b")}`, privyWalletId: `custom-${made}` })).id;
  await setAgentStatus(db, agentId, "running");
};
const claimAgentAgain = async () => { await db.update(schema.agents).set({ lastCheckAt: null }); };
const details = async () => (await log())[0]?.details as any;

test("a custom agent that passes its rules places the whole ladder and logs what it checked", async () => {
  await custom(plan);
  await check();
  const [decision] = await log();
  assert.deepEqual([decision?.action, decision?.status, decision?.amountUsd, asked], ["buy", "placed", 9, 0]);
  assert.equal((await details()).orders.length, 3);
  assert.equal((await details()).checks[0].value, "28");
  await drain();
  assert.equal(submits.length, 3);
});

test("failing rules log the reason and never call the model", async () => {
  await custom({ ...plan, judgment: "No bad news", useNews: true });
  market = { ...market, rsi: 45 };
  await check();
  const [decision] = await log();
  assert.deepEqual([decision?.status, judged], ["idle", 0]);
  assert.match(decision!.reason, /45/);
  assert.deepEqual(await claimJobs(db), []);
});

test("a negative judgment skips the trade and keeps its sources", async () => {
  await custom({ ...plan, judgment: "No bad news", useNews: true });
  verdict = { pass: false, reason: "A hack was reported.", sources: [{ title: "A", url: "https://a.com" }] };
  await check();
  const [decision] = await log();
  assert.deepEqual([decision?.status, decision?.reason, judged], ["idle", "A hack was reported.", 1]);
  assert.equal((await details()).sources.length, 1);
  assert.deepEqual(await claimJobs(db), []);
});

test("a judgment that can't finish means no trade", async () => {
  await custom({ ...plan, judgment: "No bad news" });
  await checkAgent({ ...deps(), judge: async () => { throw new Error("down"); } }, await current());
  assert.equal((await log())[0]?.status, "idle");
  assert.deepEqual(await claimJobs(db), []);
});

test("spending stops at the budget and the wallet balance", async () => {
  await custom(plan, { budgetUsd: 4, maxTradeUsd: 9 });
  await check();
  assert.equal((await log())[0]?.amountUsd, 3.99);
  usdc = "0.5";
  await custom(plan);
  await check();
  assert.match((await log())[0]!.reason, /no budget/);
});

test("it holds one position at a time, and won't stack open buys", async () => {
  await custom(plan);
  held = "0.01";
  await check();
  assert.match((await log())[0]!.reason, /already holds/);
  held = "0";
  open = [{ side: "buy", orderType: "limit", qty: "3", targetAsset: { address: WETH } }];
  await custom(plan);
  await check();
  assert.match((await log())[0]!.reason, /open buy/);
});

test("a repeating plan waits out its gap", async () => {
  await custom({ ...plan, entry: { type: "twap", durationMinutes: 120, repeatHours: 24 } });
  await check();
  assert.equal((await log())[0]?.status, "placed");
  await claimAgentAgain();
  await check();
  assert.match((await log())[0]!.reason, /less than 24 hours/);
});

test("one rung failing only gives back that rung's budget", async () => {
  await custom(plan);
  await check();
  const real = flash.submitOrder;
  let calls = 0;
  (flash as any).submitOrder = async (b: any) => { if (++calls === 2) throw new Error("rejected"); return real(b); };
  await drain();
  (flash as any).submitOrder = real;
  const [decision] = await log();
  assert.deepEqual([decision?.status, decision?.amountUsd], ["placed", 6]);
});

test("a position gets its exits once, covering only what's unprotected", async () => {
  await custom(plan);
  held = "0.01";
  await protectPositions(deps(), await current());
  const [decision] = await log();
  assert.deepEqual([decision?.action, decision?.status, decision?.amountUsd], ["exit", "placed", null]);
  await protectPositions(deps(), await current());
  assert.equal((await log()).length, 1);
  await drain();
  assert.deepEqual(submits.length, 2);
});

test("fully covered and tiny positions are left alone", async () => {
  await custom(plan);
  held = "0.01";
  open = [{ side: "sell", orderType: "bracket", qty: "0.01", filled: null, targetAsset: { address: WETH } }];
  await protectPositions(deps(), await current());
  open = [];
  held = "0.0005";
  await protectPositions(deps(), await current());
  assert.equal((await log()).length, 0);
});

test("a fill on the next ladder rung adds exits for just that part", async () => {
  await custom({ ...plan, exit: { trailPercent: 5 } });
  held = "0.02";
  open = [{ side: "sell", orderType: "trailing-stop", qty: "0.01", filled: null, targetAsset: { address: WETH } }];
  await protectPositions(deps(), await current());
  const [job] = await claimJobs(db);
  assert.equal((job?.payload as any).request.qty, "0.01");
});

test("exits wait for a TWAP to finish", async () => {
  await custom({ ...plan, exit: { trailPercent: 5 } });
  held = "0.01";
  open = [{ side: "buy", orderType: "twap", qty: "5", filled: null, targetAsset: { address: WETH } }];
  await protectPositions(deps(), await current());
  assert.equal((await log()).length, 0);
});

test("the trend template finally gets its trail", async () => {
  const ownerId = await getOrCreateWalletUser(db, "0xOwner3");
  agentId = (await createAgent(db, { ownerId, name: "Trend", settings: { ...settings, strategy: "trend" }, address: "0x00000000000000000000000000000000000000cc", privyWalletId: "w3" })).id;
  await setAgentStatus(db, agentId, "running");
  held = "0.01";
  await protectPositions(deps(), await current());
  const [job] = await claimJobs(db);
  assert.equal((job?.payload as any).request.orderType, "trailing-stop");
});

test("agents with no exits to manage are left alone", async () => {
  await setAgentStatus(db, agentId, "running");
  held = "0.01";
  await protectPositions(deps(), await current());
  assert.equal((await log()).length, 0);
});

test("a costly market buy by an agent is skipped", async () => {
  await custom({ ...plan, entry: { type: "market" } });
  await check();
  const real = flash.quote;
  (flash as any).quote = async () => ({ ...(await real({} as never)), from: { amount: "9", notional: "9" }, to: { amount: "0.001", notional: "8" } });
  await drain();
  (flash as any).quote = real;
  assert.equal(submits.length, 0);
  assert.equal((await log())[0]?.status, "failed");
});

const OWNER_CHAT = 77;
async function linked() {
  const told: string[] = [];
  await db.update(schema.users).set({ telegramId: OWNER_CHAT }).where(eq(schema.users.id, (await current()).ownerId));
  return { told, tracked: { ...deps(), send: async (_chat: number, text: string) => void told.push(text) } };
}

test("the owner hears once when it goes live", async () => {
  const { told, tracked } = await linked();
  await checkAgent(tracked, await current());
  await db.update(schema.agents).set({ status: "funding" });
  await checkAgent(tracked, await current());
  assert.equal(told.filter((t) => t.includes("Dip Hunter is live")).length, 1);
});

test("the owner hears once when it can't buy, and the reason is the real one", async () => {
  const { told, tracked } = await linked();
  await setAgentStatus(db, agentId, "running");
  usdc = "0.5";
  await checkAgent(tracked, await current());
  await db.update(schema.agents).set({ lastCheckAt: new Date(0) });
  await checkAgent(tracked, await current());
  assert.equal(told.length, 1);
  assert.match(told[0]!, /can't buy[\s\S]*less than \$1 USDC/);
  assert.equal(fundsProblem(0, 20, 20), "It has no ETH left to pay for approvals.");
  assert.equal(fundsProblem(1, 20, 0), "It has used up its budget.");
  assert.equal(fundsProblem(1, 20, 20), null);
});

test("a failed alert never stops the agent", async () => {
  const { tracked } = await linked();
  await checkAgent({ ...tracked, send: async () => { throw new Error("Telegram is down"); } }, await current());
  assert.equal((await current()).status, "running");
  assert.equal(asked, 1);
});
