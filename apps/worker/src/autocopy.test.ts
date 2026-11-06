import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { beforeEach, test } from "node:test";
import {
  claimJobs, createTrader, findWallet, getOrCreateTelegramUser, getOrCreateWalletUser, getOrder, reserveCopy, confirmCopy, saveCopySettings, schema, setCopyPaused, setFollow, type Db,
} from "@flashmob/db";
import { migrationsFolder } from "@flashmob/db/migrations";
import { DEFAULT_COPY_SETTINGS, USDC_BASE, type FlashClient } from "@flashmob/flash";
import { generateBotWallet } from "@flashmob/signer";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { sql } from "drizzle-orm";
import { runJob } from "./jobs";
import { handleOrder } from "./listener";
import type { OrderFrame } from "./trades";

const masterKey = randomBytes(32);
const WETH = "0x4200000000000000000000000000000000000006";
const typedData = JSON.stringify({ domain: { name: "T", chainId: 8453 }, types: { M: [{ name: "a", type: "uint256" }] }, primaryType: "M", message: { a: "1" } });
const CHAT = 700;

let db: Db;
let sent: string[];
let submits: any[];
let cancels: string[];
let usdc: string;
let trader: { id: string };
let follower: { userId: string; walletId: string; address: string };

const flash = {
  quote: async () => ({ quoteId: "q", from: { amount: "10", notional: "10" }, to: { amount: "0.005" }, fees: {}, evm: { approveTx: null, permitTypedData: "", orderTypedData: typedData } }),
  balances: async () => ({ balances: [{ chain: "base", address: USDC_BASE, balance: usdc, isNative: false, symbol: "USDC" }] }),
  submitOrder: async (b: any) => (submits.push(b), { orderId: `placed-${submits.length}` }),
  getOrder: async () => ({ order: { attachedBracket: undefined, expiresAt: new Date(Date.now() + 3600_000).toISOString() } }),
  cancelOrder: async (id: string) => (cancels.push(id), { ok: true }),
} as unknown as FlashClient;
const send = async (_chat: number, text: string) => void sent.push(text);
const on = { enabled: true, searchFlash: flash };

const frame = (over: Partial<OrderFrame> = {}): OrderFrame => ({
  orderId: "t1", orderType: "market", side: "buy", status: "ORDER_STATUS_FILLED", funderAddress: "0xtrader", qty: "1000",
  targetAsset: { ticker: "WETH", address: WETH, chain: "base" }, contraAsset: { ticker: "USDC", address: USDC_BASE, chain: "base" },
  filled: { targetAmount: "0.5", contraAmount: "1000" }, placedAt: new Date().toISOString(), ...over,
});

const save = (over = {}) => saveCopySettings(db, follower.userId, trader.id, { ...DEFAULT_COPY_SETTINGS, enabled: true, ...over });
const drain = async () => { for (const job of await claimJobs(db)) await runJob({ db, flash, masterKey, feeBps: "10", send }, job); };

beforeEach(async () => {
  const pg = drizzle(new PGlite(), { schema });
  await migrate(pg, { migrationsFolder });
  db = pg as unknown as Db;
  sent = []; submits = []; cancels = []; usdc = "500";
  const userId = await getOrCreateWalletUser(db, "0xTrader");
  trader = (await createTrader(db, { userId, displayName: "Ana" }))!;
  const f = await getOrCreateTelegramUser(db, { id: CHAT }, (id) => generateBotWallet(masterKey, id));
  follower = { userId: f.user.id, walletId: f.wallet.id, address: f.wallet.address };
  await setFollow(db, f.user.id, trader.id, true);
});

test("the master switch keeps everything off", async () => {
  await save();
  await handleOrder(db, flash, send, frame(), true, { ...on, enabled: false });
  await drain();
  assert.equal(submits.length, 0);
});

test("a trader's buy is copied at the follower's size, from their own wallet", async () => {
  await save({ amountUsd: 30 });
  await handleOrder(db, flash, send, frame(), true, on);
  await drain();
  assert.deepEqual([submits.length, submits[0].qty, submits[0].funderAddress, submits[0].orderType], [1, "30", follower.address, "market"]);
  assert.ok(sent.includes("Auto-copied Ana's WETH trade."));
});

test("a replayed frame never copies twice", async () => {
  await save();
  await handleOrder(db, flash, send, frame(), true, on);
  await handleOrder(db, flash, send, frame(), true, on);
  await drain();
  assert.equal(submits.length, 1);
});

test("nothing is copied when paused, disabled or from a reconnect snapshot", async () => {
  await save({ enabled: false });
  await handleOrder(db, flash, send, frame({ orderId: "a" }), true, on);
  await save();
  await setCopyPaused(db, follower.userId, true);
  await handleOrder(db, flash, send, frame({ orderId: "b" }), true, on);
  await setCopyPaused(db, follower.userId, false);
  await handleOrder(db, flash, send, frame({ orderId: "c" }), false, on);
  await drain();
  assert.equal(submits.length, 0);
});

test("a skip tells the follower why", async () => {
  await save();
  usdc = "5";
  await handleOrder(db, flash, send, frame(), true, on);
  await drain();
  assert.equal(submits.length, 0);
  assert.ok(sent.some((t) => /Skipped copying Ana: Not enough USDC/.test(t)));
});

test("the daily limit holds across trades", async () => {
  await save({ amountUsd: 60, dailyCapUsd: 100, maxEntryDriftPercent: 50 });
  await handleOrder(db, flash, send, frame({ orderId: "a" }), true, on);
  await drain();
  await handleOrder(db, flash, send, frame({ orderId: "b" }), true, on);
  await drain();
  await handleOrder(db, flash, send, frame({ orderId: "c" }), true, on);
  await drain();
  assert.deepEqual(submits.map((s) => s.qty), ["60", "40"]);
  assert.ok(sent.some((t) => /daily limit/.test(t)));
});

test("a copied order never triggers more copies", async () => {
  const followerTrader = (await createTrader(db, { userId: follower.userId, displayName: "Bo" }))!;
  const second = await getOrCreateTelegramUser(db, { id: 701 }, (id) => generateBotWallet(masterKey, id));
  await saveCopySettings(db, second.user.id, followerTrader.id, { ...DEFAULT_COPY_SETTINGS, enabled: true });
  await save();
  await handleOrder(db, flash, send, frame(), true, on);
  await drain();
  await handleOrder(db, flash, send, frame({ orderId: "placed-1", funderAddress: follower.address, qty: "25", filled: { targetAmount: "0.0125", contraAmount: "25" } }), true, on);
  await drain();
  assert.equal(submits.length, 1);
});

test("an order placed by the follower by hand can still be copied", async () => {
  const followerTrader = (await createTrader(db, { userId: follower.userId, displayName: "Bo" }))!;
  const second = await getOrCreateTelegramUser(db, { id: 702 }, (id) => generateBotWallet(masterKey, id));
  await saveCopySettings(db, second.user.id, followerTrader.id, { ...DEFAULT_COPY_SETTINGS, enabled: true });
  await handleOrder(db, flash, send, frame({ orderId: "own", funderAddress: follower.address, qty: "25", filled: { targetAmount: "0.0125", contraAmount: "25" } }), true, on);
  await drain();
  assert.equal(submits.length, 1);
});

async function followerHolds(qty: string) {
  await handleOrder(db, flash, send, frame({ orderId: "t1" }), true);
  await handleOrder(db, flash, send, frame({ orderId: "c1", funderAddress: follower.address, filled: { targetAmount: qty, contraAmount: "25" } }), true);
  const copy = (await reserveCopy(db, { sourceOrderId: "t1", userId: follower.userId, walletId: follower.walletId, amountUsd: 25 }))!;
  await confirmCopy(db, copy.id, follower.userId, "c1");
}
const sale = frame({ orderId: "s1", side: "sell", qty: "0.25", filled: { targetAmount: "0.25", contraAmount: "600" } });

test("with auto-sell on, the same share is sold automatically", async () => {
  await followerHolds("0.02");
  await save({ autoSell: true });
  await handleOrder(db, flash, send, sale, true, on);
  await drain();
  assert.deepEqual([submits.length, submits[0].side, submits[0].qty], [1, "sell", "0.01"]);
  assert.ok(sent.some((t) => /Auto-sold: Sold 0\.01 WETH, 50% of your copy/.test(t)));
});

test("with auto-sell off, the follower gets a prompt and nothing sells", async () => {
  await followerHolds("0.02");
  await save({ autoSell: false });
  await handleOrder(db, flash, send, sale, true, on);
  await drain();
  assert.equal(submits.length, 0);
  assert.ok(sent.some((t) => /Sell the same share/.test(t)));
});

test("a partial auto-sale swaps the stop and target for the rest, in that order", async () => {
  await followerHolds("0.02");
  await handleOrder(db, flash, send, frame({ orderId: "pair", funderAddress: follower.address, orderType: "bracket", side: "sell", status: "ORDER_STATUS_ACCEPTED", filled: null, sourceEntryOrderId: "c1", brackets: [{ notionalPrice: "1800", triggerType: "lower" }, { notionalPrice: "2400", triggerType: "upper" }] }), true);
  await db.execute(sql`update orders set raw = ${JSON.stringify({ attachedBracket: { status: "active", bracketOrderId: "pair" } })}::jsonb where id = 'c1'`);
  await save({ autoSell: true });
  await handleOrder(db, flash, send, sale, true, on);
  await drain();
  assert.deepEqual(cancels, ["pair"]);
  assert.deepEqual(submits.map((s) => [s.orderType, s.qty]), [["market", "0.01"], ["bracket", "0.01"]]);
  assert.equal((await getOrder(db, "t1"))!.side, "buy");
  assert.ok(await findWallet(db, follower.address));
});
