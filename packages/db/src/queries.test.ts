import assert from "node:assert/strict";
import { before, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { alertRecipients, applyOrderFrame, getOrCreateTelegramAccount, getTradingWallet, getUserByTelegram, syncPrivyUser, claimJobs, claimMirror, completeMirror, createMirrors, dismissMirror, listCopyOrders, listMirrors, releaseMirror, enqueueJob, finishJob, getJob, recordOrder, claimAction, confirmCopy, countCopies, createAction, createLinkToken, createTrader, findWallet, getOrCreateWalletUser, getPosition, getTrade, getTraderByUser, leaderboard, linkTelegram, listTrades, releaseCopy, reserveCopy, countAgents, createAgent, getTraderByName, listAgents, setAgentPrivate, setFollow, type Db, type OrderFields, removeAgent, getAgentByTrader, listAgentTraders, activeAgents } from "./queries";
import { sql } from "drizzle-orm";
import * as schema from "./schema";

let db: Db;
const telegramUser = async (id: number) => ({ user: await getOrCreateTelegramAccount(db, { id }) });

before(async () => {
  const pg = drizzle(new PGlite(), { schema });
  await migrate(pg, { migrationsFolder: new URL("../migrations", import.meta.url).pathname });
  db = pg as unknown as Db;
});

test("a confirm action only runs once, even when tapped repeatedly", async () => {
  const { user } = await telegramUser(101);
  const id = await createAction(db, user.id, "buy", { qty: "5" });
  const claims = await Promise.all([1, 2, 3, 4, 5].map(() => claimAction(db, id, user.id)));
  assert.equal(claims.filter(Boolean).length, 1);
});

test("another user cannot claim an action", async () => {
  const a = await telegramUser(102);
  const b = await telegramUser(103);
  const id = await createAction(db, a.user.id, "buy", {});
  assert.equal(await claimAction(db, id, b.user.id), undefined);
  assert.ok(await claimAction(db, id, a.user.id));
});

test("an expired action cannot be claimed", async () => {
  const { user } = await telegramUser(104);
  const id = await createAction(db, user.id, "buy", {}, -1);
  assert.equal(await claimAction(db, id, user.id), undefined);
});


test("linking moves the web wallet and trader onto the Telegram user, and the token works once", async () => {
  const webId = await getOrCreateWalletUser(db, "0xAbC1");
  await createTrader(db, { userId: webId, displayName: "linker" });
  const tg = await telegramUser(200);
  await createLinkToken(db, "tok1", webId);
  assert.equal(await linkTelegram(db, "tok1", tg.user.id), "linked");
  assert.equal(await linkTelegram(db, "tok1", tg.user.id), "invalid");
  assert.equal((await findWallet(db, "0xabc1"))!.userId, tg.user.id);
  assert.ok(await getTraderByUser(db, tg.user.id));
});

test("an expired link token does nothing", async () => {
  const webId = await getOrCreateWalletUser(db, "0xAbC2");
  const tg = await telegramUser(201);
  await createLinkToken(db, "tok2", webId, -1);
  assert.equal(await linkTelegram(db, "tok2", tg.user.id), "invalid");
  assert.equal((await findWallet(db, "0xabc2"))!.userId, webId);
});

test("alerts only go to followers with Telegram linked", async () => {
  const u = await getOrCreateWalletUser(db, "0xAbC4");
  const t = (await createTrader(db, { userId: u, displayName: "alerter" }))!;
  const tg = await telegramUser(300);
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
  assert.equal(row!.walletAddress, "0xD6");
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

test("a job is claimed once, even by competing workers", async () => {
  const w = await wallet("0xE1");
  const id = await enqueueJob(db, { ...w, kind: "cancel", payload: {} });
  const [a, b] = await Promise.all([claimJobs(db), claimJobs(db)]);
  assert.equal([...a, ...b].filter((j) => j.id === id).length, 1);
  assert.equal((await claimJobs(db)).filter((j) => j.id === id).length, 0);
});

test("an old job fails instead of running late", async () => {
  const w = await wallet("0xE2");
  const id = await enqueueJob(db, { ...w, kind: "order", payload: {} });
  await db.execute(sql`update wallet_jobs set created_at = now() - interval '5 minutes' where id = ${id}`);
  assert.equal((await claimJobs(db)).filter((j) => j.id === id).length, 0);
  assert.match((await getJob(db, id, w.userId))!.error!, /timed out/);
});

test("a job cut off while running is reported and never run again", async () => {
  const w = await wallet("0xE9");
  const id = await enqueueJob(db, { ...w, kind: "order", payload: {} });
  await claimJobs(db);
  await claimJobs(db);
  assert.equal((await getJob(db, id, w.userId))!.status, "running");
  await db.execute(sql`update wallet_jobs set created_at = now() - interval '20 minutes' where id = ${id}`);
  assert.equal((await claimJobs(db)).filter((j) => j.id === id).length, 0);
  const job = (await getJob(db, id, w.userId))!;
  assert.equal(job.status, "failed");
  assert.match(job.error!, /interrupted/);
});

test("a job is only visible to its owner, and records its outcome", async () => {
  const w = await wallet("0xE3");
  const other = await wallet("0xE4");
  const id = await enqueueJob(db, { ...w, kind: "order", payload: {} });
  assert.equal(await getJob(db, id, other.userId), undefined);
  await finishJob(db, id, { result: { orderId: "o" } });
  assert.deepEqual((await getJob(db, id, w.userId))!.result, { orderId: "o" });
});

// A trader buys, a follower copies, and each fill goes through the same path as the live stream.
async function mirrorSetup(n: number, copyQty = 0.02, traderQty = 2) {
  const trader = await wallet(`0xF${n}a`);
  await createTrader(db, { userId: trader.userId, displayName: `mirrored${n}` });
  const token = `0xtoken${n}`;
  const { order: buy } = await applyOrderFrame(db, frame(trader, { tokenAddress: token, filledQty: traderQty, filledUsd: traderQty * 100 }));
  const follower = await wallet(`0xF${n}b`);
  const { order: copied } = await applyOrderFrame(db, frame(follower, { isPublic: false, tokenAddress: token, filledQty: copyQty, filledUsd: copyQty * 100 }));
  const copy = (await reserveCopy(db, { sourceOrderId: buy.id, ...follower, amountUsd: 2 }))!;
  await confirmCopy(db, copy.id, follower.userId, copied.id);
  const sell = async (qty: number) => (await applyOrderFrame(db, frame(trader, { side: "sell", tokenAddress: token, filledQty: qty, filledUsd: qty * 120 }))).order;
  return { trader, follower, token, sell };
}

test("a follower is prompted to sell the same share, not the same amount", async () => {
  const { follower, token, sell } = await mirrorSetup(1);
  const [m] = await createMirrors(db, await sell(1));
  assert.deepEqual([m!.percent, m!.qty, m!.tokenAddress], [50, 0.01, token]);
  assert.equal(m!.userId, follower.userId);
});

test("a repeated sale event creates no second prompt", async () => {
  const { sell } = await mirrorSetup(2);
  const order = await sell(1);
  assert.equal((await createMirrors(db, order)).length, 1);
  assert.equal((await createMirrors(db, order)).length, 0);
});

test("a second sale is a share of what's left", async () => {
  const { follower, sell } = await mirrorSetup(3);
  const [first] = await createMirrors(db, await sell(1));
  await claimMirror(db, first!.id, follower.userId);
  await completeMirror(db, first!.id, follower.userId, "mirror-order-3");
  await applyOrderFrame(db, frame(follower, { id: "mirror-order-3", side: "sell", isPublic: false, tokenAddress: first!.tokenAddress, filledQty: 0.01, filledUsd: 1.2 }));
  const [second] = await createMirrors(db, await sell(1));
  assert.deepEqual([second!.percent, Number(second!.qty.toFixed(8))], [100, 0.01]);
});

test("a follower who already exited is skipped", async () => {
  const { follower, token, sell } = await mirrorSetup(4);
  await applyOrderFrame(db, frame(follower, { side: "sell", isPublic: false, tokenAddress: token, filledQty: 0.02, filledUsd: 2 }));
  assert.equal((await createMirrors(db, await sell(1))).length, 0);
});

test("only the copied part is touched, not tokens bought separately", async () => {
  const { follower, token, sell } = await mirrorSetup(5);
  await applyOrderFrame(db, frame(follower, { isPublic: false, tokenAddress: token, filledQty: 5, filledUsd: 500 }));
  const [m] = await createMirrors(db, await sell(2));
  assert.deepEqual([m!.percent, m!.qty], [100, 0.02]);
});

test("a follower who sold some themselves is capped at what they still hold", async () => {
  const { follower, token, sell } = await mirrorSetup(6);
  await applyOrderFrame(db, frame(follower, { side: "sell", isPublic: false, tokenAddress: token, filledQty: 0.015, filledUsd: 1.5 }));
  const [m] = await createMirrors(db, await sell(2));
  assert.equal(Number(m!.qty.toFixed(8)), 0.005);
});

test("a sale of tokens the trader never tracked prompts nobody", async () => {
  const { sell } = await mirrorSetup(7);
  const order = await sell(1);
  assert.equal((await createMirrors(db, { ...order, heldBeforeSell: 0 })).length, 0);
});

test("a prompt can only be acted on once, by its owner, and can be retried if abandoned", async () => {
  const { follower, sell } = await mirrorSetup(8);
  const [m] = await createMirrors(db, await sell(1));
  const other = await wallet("0xF8c");
  assert.equal(await claimMirror(db, m!.id, other.userId), undefined);
  const claims = await Promise.all([1, 2, 3].map(() => claimMirror(db, m!.id, follower.userId)));
  assert.equal(claims.filter(Boolean).length, 1);
  await releaseMirror(db, m!.id, follower.userId);
  assert.ok(await claimMirror(db, m!.id, follower.userId));
  await db.execute(sql`update mirrors set updated_at = now() - interval '1 hour' where id = ${m!.id}`);
  assert.ok(await claimMirror(db, m!.id, follower.userId));
  assert.ok(await completeMirror(db, m!.id, follower.userId, "mirror-order-8"));
  assert.equal(await claimMirror(db, m!.id, follower.userId), undefined);
});

test("a dismissed prompt disappears", async () => {
  const { follower, sell } = await mirrorSetup(9);
  const [m] = await createMirrors(db, await sell(1));
  assert.equal((await listMirrors(db, follower.userId)).length, 1);
  await dismissMirror(db, m!.id, follower.userId);
  assert.equal((await listMirrors(db, follower.userId)).length, 0);
});

test("a prompt can find the copy orders behind it", async () => {
  const { follower, token, sell } = await mirrorSetup(10);
  await createMirrors(db, await sell(1));
  const [prompt] = await listMirrors(db, follower.userId);
  assert.equal(prompt!.trader, "mirrored10");
  assert.equal((await listCopyOrders(db, follower.walletId, token)).length, 1);
});

const embedded = (n: number, delegated = false) => ({ walletId: `pw-${n}`, address: `0xEmb${n}`, delegated });

test("a new Privy user gets one account with their embedded wallet", async () => {
  const id = await syncPrivyUser(db, { privyId: "did:1", embedded: embedded(1), externalAddresses: [] });
  assert.equal((await findWallet(db, "0xemb1"))!.userId, id);
  assert.equal(await syncPrivyUser(db, { privyId: "did:1", embedded: embedded(1), externalAddresses: [] }), id);
});

test("a wallet only becomes usable by the server once the user approves it", async () => {
  const id = await syncPrivyUser(db, { privyId: "did:2", embedded: embedded(2), externalAddresses: [] });
  assert.equal(await getTradingWallet(db, id), undefined);
  await syncPrivyUser(db, { privyId: "did:2", embedded: embedded(2, true), externalAddresses: [] });
  assert.equal((await getTradingWallet(db, id))!.privyWalletId, "pw-2");
});

test("revoking approval removes server access", async () => {
  const id = await syncPrivyUser(db, { privyId: "did:3", embedded: embedded(3, true), externalAddresses: [] });
  await syncPrivyUser(db, { privyId: "did:3", embedded: embedded(3, false), externalAddresses: [] });
  assert.equal(await getTradingWallet(db, id), undefined);
});

test("web and Telegram become one account, keeping the Telegram user", async () => {
  const tg = await getOrCreateTelegramAccount(db, { id: 5000 });
  const webId = await getOrCreateWalletUser(db, "0xMeta");
  await createTrader(db, { userId: webId, displayName: "merged" });
  const id = await syncPrivyUser(db, { privyId: "did:4", telegramId: 5000, embedded: embedded(4, true), externalAddresses: ["0xMeta"] });
  assert.equal(id, tg.id);
  assert.equal((await findWallet(db, "0xmeta"))!.userId, tg.id);
  assert.ok(await getTraderByUser(db, tg.id));
});

test("two trader profiles are never merged", async () => {
  const a = await getOrCreateWalletUser(db, "0xT1");
  await createTrader(db, { userId: a, displayName: "t1" });
  const tg = await getOrCreateTelegramAccount(db, { id: 5002 });
  await createTrader(db, { userId: tg.id, displayName: "t2" });
  await syncPrivyUser(db, { privyId: "did:6", telegramId: 5002, externalAddresses: ["0xT1"] });
  assert.ok(await getTraderByUser(db, a));
  assert.ok(await getTraderByUser(db, tg.id));
});

test("an agent gets its own wallet and public profile, kept apart from its owner", async () => {
  const ownerId = await getOrCreateWalletUser(db, "0xOwner");
  const agent = await createAgent(db, { ownerId, name: "Dip Hunter", settings: { strategy: "dip" }, address: "0xAgent", privyWalletId: "w1" });
  assert.notEqual(agent.userId, ownerId);
  const wallet = await getTradingWallet(db, agent.userId);
  assert.deepEqual([wallet?.address, wallet?.delegated], ["0xAgent", true]);
  assert.equal(await getTradingWallet(db, ownerId), undefined);
  assert.equal((await getTraderByName(db, "dip hunter"))?.id, agent.traderId);
  assert.equal((await listAgents(db, ownerId))[0]?.status, "funding");
  assert.equal(await countAgents(db, ownerId), 1);
});

test("a removed agent leaves the owner's list but keeps its public record", async () => {
  const ownerId = await getOrCreateWalletUser(db, "0xRemovedOwner");
  const agent = await createAgent(db, { ownerId, name: "Old Bot", settings: { strategy: "dip" }, address: "0xOld", privyWalletId: "old" });
  await removeAgent(db, agent.id);
  assert.deepEqual(await listAgents(db, ownerId), []);
  assert.equal((await getAgentByTrader(db, agent.traderId))?.status, "stopped");
  assert.equal((await listAgentTraders(db)).find((a) => a.traderId === agent.traderId)?.status, "stopped");
  assert.ok(!(await activeAgents(db)).some((a) => a.id === agent.id));
});

test("an agent can go private and back, and keeps its other settings", async () => {
  const ownerId = await getOrCreateWalletUser(db, "0xPrivacyOwner");
  const agent = await createAgent(db, { ownerId, name: "Quiet One", settings: { strategy: "dip", budgetUsd: 25 }, address: "0xQuiet", privyWalletId: "w-quiet" });
  const settings = async () => (await listAgents(db, ownerId))[0]?.settings;
  await setAgentPrivate(db, agent.id, true);
  assert.deepEqual(await settings(), { strategy: "dip", budgetUsd: 25, hideStrategy: true });
  await setAgentPrivate(db, agent.id, false);
  assert.deepEqual(await settings(), { strategy: "dip", budgetUsd: 25, hideStrategy: false });
});
