import assert from "node:assert/strict";
import { before, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import {
  alertRecipients, applyOrderFrame, recordOrder, claimAction, confirmCopy, countCopies, createAction, createLinkToken, createTrader, findWallet, getBotWallet,
  getOrCreateTelegramUser, getOrCreateWalletUser, getPosition, getTrade, getTraderByUser, leaderboard, linkTelegram, listTrades, releaseCopy, reserveCopy,
  setFollow, type Db, type OrderFields,
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

let orderN = 0;
async function wallet(address: string) {
  const userId = await getOrCreateWalletUser(db, address);
  return { userId, walletId: (await findWallet(db, address))!.id };
}
const frame = (w: { userId: string; walletId: string }, over: Partial<OrderFields> = {}): OrderFields => ({
  id: `order-${++orderN}`, ...w, isPublic: true, status: "ORDER_STATUS_FILLED", raw: {}, side: "buy", orderType: "market", chain: "base",
  tokenSymbol: "WETH", tokenAddress: "0xweth", qty: "100", limitPrice: null, stopPrice: null, targetPrice: null, entryOrderId: null,
  filledQty: 1, filledUsd: 100, usdPriced: true, placedAt: new Date(), ...over,
});

test("a replayed frame does not double count a fill", async () => {
  const w = await wallet("0xD1");
  const f = frame(w);
  await applyOrderFrame(db, f);
  await applyOrderFrame(db, f);
  const held = await getPosition(db, w.walletId, "0xweth");
  assert.deepEqual([held!.qty, held!.costUsd], [1, 100]);
});

test("partial fills only add what is new", async () => {
  const w = await wallet("0xD2");
  const f = frame(w, { status: "ORDER_STATUS_PARTIALLY_FILLED", filledQty: 0.5, filledUsd: 50 });
  await applyOrderFrame(db, f);
  await applyOrderFrame(db, { ...f, status: "ORDER_STATUS_FILLED", filledQty: 1, filledUsd: 110 });
  const held = await getPosition(db, w.walletId, "0xweth");
  assert.deepEqual([held!.qty, held!.costUsd], [1, 110]);
});

test("a sale records profit against average cost", async () => {
  const w = await wallet("0xD3");
  await applyOrderFrame(db, frame(w, { filledQty: 2, filledUsd: 200 }));
  const { order } = await applyOrderFrame(db, frame(w, { side: "sell", filledQty: 1, filledUsd: 150 }));
  assert.deepEqual([order.realizedUsd, order.soldCostUsd], [50, 100]);
  const held = await getPosition(db, w.walletId, "0xweth");
  assert.deepEqual([held!.qty, held!.costUsd], [1, 100]);
});

test("selling more than we tracked only counts the tracked part", async () => {
  const w = await wallet("0xD4");
  await applyOrderFrame(db, frame(w, { filledQty: 1, filledUsd: 100 }));
  const { order } = await applyOrderFrame(db, frame(w, { side: "sell", filledQty: 2, filledUsd: 300 }));
  assert.deepEqual([order.realizedUsd, order.soldCostUsd], [50, 100]);
  assert.equal((await getPosition(db, w.walletId, "0xweth"))!.qty, 0);
});

test("a pair not priced in USDC doesn't touch positions", async () => {
  const w = await wallet("0xD5");
  await applyOrderFrame(db, frame(w, { usdPriced: false }));
  assert.equal(await getPosition(db, w.walletId, "0xweth"), undefined);
});

test("an order saved by the bot first still becomes public", async () => {
  const w = await wallet("0xD7");
  const f = frame(w);
  await recordOrder(db, { id: f.id, userId: w.userId, walletId: w.walletId, request: {} });
  const { order, seenBefore } = await applyOrderFrame(db, f);
  assert.equal(order.isPublic, true);
  assert.equal(seenBefore, false);
});

test("the leaderboard uses realized results and private orders never show", async () => {
  const w = await wallet("0xD6");
  const t = (await createTrader(db, { userId: w.userId, displayName: "ranked" }))!;
  await applyOrderFrame(db, frame(w, { filledQty: 2, filledUsd: 200 }));
  await applyOrderFrame(db, frame(w, { side: "sell", filledQty: 1, filledUsd: 120 }));
  await applyOrderFrame(db, frame(w, { side: "sell", filledQty: 1, filledUsd: 90 }));
  const hidden = frame(w, { isPublic: false, filledQty: 5, filledUsd: 500 });
  await applyOrderFrame(db, hidden);
  const [row] = await leaderboard(db, [t.id]);
  assert.deepEqual([row!.trades, row!.closed, row!.wins, row!.realizedUsd, row!.soldCostUsd], [3, 2, 1, 10, 200]);
  assert.equal(await getTrade(db, hidden.id), undefined);
  assert.ok(!(await listTrades(db, 100)).some((r) => r.order.id === hidden.id));
});

async function copySetup(n: number) {
  const trader = await wallet(`0xCa${n}`);
  await createTrader(db, { userId: trader.userId, displayName: `copied${n}` });
  const { order } = await applyOrderFrame(db, frame(trader));
  const follower = await wallet(`0xCb${n}`);
  return { order, userId: follower.userId, values: { sourceOrderId: order.id, ...follower, amountUsd: 10, stopPrice: 90, targetPrice: 120 } };
}

test("one wallet can only hold one reservation for a trade", async () => {
  const { values } = await copySetup(1);
  const results = await Promise.all([1, 2, 3].map(() => reserveCopy(db, values)));
  assert.equal(results.filter(Boolean).length, 1);
});

test("a placed copy can never be reserved again, and it counts once", async () => {
  const { order, userId, values } = await copySetup(2);
  const copy = (await reserveCopy(db, values))!;
  assert.ok(await confirmCopy(db, copy.id, userId, "order-c2"));
  assert.equal(await confirmCopy(db, copy.id, userId, "order-c2b"), undefined);
  assert.equal(await reserveCopy(db, values), undefined);
  await db.execute(sql`update copies set created_at = now() - interval '1 hour' where id = ${copy.id}`);
  assert.equal(await reserveCopy(db, values), undefined);
  assert.equal(await countCopies(db, order.id), 1);
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
