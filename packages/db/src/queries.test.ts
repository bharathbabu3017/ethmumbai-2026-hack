import assert from "node:assert/strict";
import { before, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import {
  alertRecipients, claimAction, confirmCopy, countCopies, findWallet as walletOf, releaseCopy, reserveCopy, claimUnannouncedCalls, createAction, createCall, createLinkToken, createTrader, findWallet, getBotWallet,
  getOrCreateTelegramUser, getOrCreateWalletUser, getTraderByUser, leaderboard, linkTelegram, moveCall, setFollow, type Db,
} from "./queries";
import { sql } from "drizzle-orm";
import * as schema from "./schema";

let db: Db;
let n = 0;
const makeWallet = () => ({ address: `0xwallet${++n}`, encryptedKey: "v1:x:y:z" });

before(async () => {
  const pg = drizzle(new PGlite(), { schema });
  await migrate(pg, { migrationsFolder: new URL("../migrations", import.meta.url).pathname });
  db = pg as unknown as Db;
});

test("a user gets one wallet, even when /start races", async () => {
  const results = await Promise.all([1, 2, 3, 4].map(() => getOrCreateTelegramUser(db, { id: 100, username: "a" }, makeWallet)));
  assert.equal(new Set(results.map((r) => r.user.id)).size, 1);
  assert.equal(new Set(results.map((r) => r.wallet.id)).size, 1);
  assert.equal(results.filter((r) => r.created).length, 1);
});

test("a confirm action only runs once, even when tapped repeatedly", async () => {
  const { user } = await getOrCreateTelegramUser(db, { id: 101 }, makeWallet);
  const id = await createAction(db, user.id, "buy", { qty: "5" });
  const claims = await Promise.all([1, 2, 3, 4, 5].map(() => claimAction(db, id, user.id)));
  assert.equal(claims.filter(Boolean).length, 1);
});

test("another user cannot claim an action", async () => {
  const a = await getOrCreateTelegramUser(db, { id: 102 }, makeWallet);
  const b = await getOrCreateTelegramUser(db, { id: 103 }, makeWallet);
  const id = await createAction(db, a.user.id, "buy", {});
  assert.equal(await claimAction(db, id, b.user.id), undefined);
  assert.ok(await claimAction(db, id, a.user.id));
});

test("an expired action cannot be claimed", async () => {
  const { user } = await getOrCreateTelegramUser(db, { id: 104 }, makeWallet);
  const id = await createAction(db, user.id, "buy", {}, -1);
  assert.equal(await claimAction(db, id, user.id), undefined);
});

const callValues = (traderId: string, orderId: string) => ({
  traderId, orderId, funderAddress: "0xf", chain: "base", tokenSymbol: "WETH", tokenAddress: "0xw", entryType: "market", stopPrice: 90, targetPrice: 120,
});

test("linking moves the web wallet and trader onto the Telegram user, and the token works once", async () => {
  const webId = await getOrCreateWalletUser(db, "0xAbC1");
  await createTrader(db, { userId: webId, displayName: "linker" });
  const tg = await getOrCreateTelegramUser(db, { id: 200 }, makeWallet);
  await createLinkToken(db, "tok1", webId);
  assert.equal(await linkTelegram(db, "tok1", tg.user.id), "linked");
  assert.equal(await linkTelegram(db, "tok1", tg.user.id), "invalid");
  assert.equal((await findWallet(db, "0xabc1"))!.userId, tg.user.id);
  assert.ok(await getTraderByUser(db, tg.user.id));
  assert.equal((await getBotWallet(db, tg.user.id))!.id, tg.wallet.id);
});

test("an expired link token does nothing", async () => {
  const webId = await getOrCreateWalletUser(db, "0xAbC2");
  const tg = await getOrCreateTelegramUser(db, { id: 201 }, makeWallet);
  await createLinkToken(db, "tok2", webId, -1);
  assert.equal(await linkTelegram(db, "tok2", tg.user.id), "invalid");
  assert.equal((await findWallet(db, "0xabc2"))!.userId, webId);
});

test("a call is only announced once and a repeated status change is ignored", async () => {
  const u = await getOrCreateWalletUser(db, "0xAbC3");
  const t = (await createTrader(db, { userId: u, displayName: "caller" }))!;
  const call = (await createCall(db, callValues(t.id, "o1")))!;
  assert.equal(await createCall(db, callValues(t.id, "o1")), undefined);
  assert.equal((await claimUnannouncedCalls(db)).filter((c) => c.id === call.id).length, 1);
  assert.equal((await claimUnannouncedCalls(db)).filter((c) => c.id === call.id).length, 0);
  assert.ok(await moveCall(db, call.id, { status: "live" }));
  assert.equal(await moveCall(db, call.id, { status: "live" }), undefined);
});

test("alerts only go to followers with Telegram linked", async () => {
  const u = await getOrCreateWalletUser(db, "0xAbC4");
  const t = (await createTrader(db, { userId: u, displayName: "alerter" }))!;
  const tg = await getOrCreateTelegramUser(db, { id: 300 }, makeWallet);
  const webOnly = await getOrCreateWalletUser(db, "0xAbC5");
  await setFollow(db, tg.user.id, t.id, true);
  await setFollow(db, webOnly, t.id, true);
  assert.deepEqual(await alertRecipients(db, t.id), [300]);
  await setFollow(db, tg.user.id, t.id, false);
  assert.deepEqual(await alertRecipients(db, t.id), []);
});

test("the leaderboard counts only closed calls", async () => {
  const u = await getOrCreateWalletUser(db, "0xAbC6");
  const t = (await createTrader(db, { userId: u, displayName: "ranked" }))!;
  const a = (await createCall(db, callValues(t.id, "r1")))!;
  const b = (await createCall(db, callValues(t.id, "r2")))!;
  await createCall(db, callValues(t.id, "r3"));
  await moveCall(db, a.id, { status: "target_hit", resultPct: 20 });
  await moveCall(db, b.id, { status: "stopped_out", resultPct: -5 });
  const [row] = await leaderboard(db, [t.id]);
  assert.deepEqual([row!.totalCalls, row!.closedCalls, row!.wins, row!.totalReturn], [3, 2, 1, 15]);
});

async function copySetup(n: number) {
  const trader = await getOrCreateWalletUser(db, `0xCa${n}`);
  const t = (await createTrader(db, { userId: trader, displayName: `copied${n}` }))!;
  const call = (await createCall(db, callValues(t.id, `c${n}`)))!;
  const userId = await getOrCreateWalletUser(db, `0xCb${n}`);
  const wallet = (await walletOf(db, `0xCb${n}`))!;
  return { call, userId, values: { callId: call.id, userId, walletId: wallet.id, amountUsd: 10, stopPrice: 90, targetPrice: 120 } };
}

test("one wallet can only hold one reservation for a call", async () => {
  const { values } = await copySetup(1);
  const results = await Promise.all([1, 2, 3].map(() => reserveCopy(db, values)));
  assert.equal(results.filter(Boolean).length, 1);
});

test("a placed copy can never be reserved again, and it counts once", async () => {
  const { call, userId, values } = await copySetup(2);
  const copy = (await reserveCopy(db, values))!;
  assert.ok(await confirmCopy(db, copy.id, userId, "order-c2"));
  assert.equal(await confirmCopy(db, copy.id, userId, "order-c2b"), undefined);
  assert.equal(await reserveCopy(db, values), undefined);
  await db.execute(sql`update copies set created_at = now() - interval '1 hour' where id = ${copy.id}`);
  assert.equal(await reserveCopy(db, values), undefined);
  assert.equal(await countCopies(db, call.id), 1);
});

test("a released or abandoned reservation can be tried again", async () => {
  const { userId, values } = await copySetup(3);
  const first = (await reserveCopy(db, values))!;
  await releaseCopy(db, first.id, userId);
  const second = (await reserveCopy(db, values))!;
  assert.ok(second);
  assert.equal(await reserveCopy(db, values), undefined);
  await db.execute(sql`update copies set created_at = now() - interval '1 hour' where id = ${second.id}`);
  assert.ok(await reserveCopy(db, values));
});

test("someone else can't confirm or release your copy", async () => {
  const { userId, values } = await copySetup(4);
  const other = await getOrCreateWalletUser(db, "0xCc4");
  const copy = (await reserveCopy(db, values))!;
  assert.equal(await confirmCopy(db, copy.id, other, "order-c4"), undefined);
  await releaseCopy(db, copy.id, other);
  assert.ok(await confirmCopy(db, copy.id, userId, "order-c4"));
});
