import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { confirmCopy, getOrCreateTelegramAccount, getTraderByUser, setAlertLimits, createTrader, reserveCopy, getOrCreateWalletUser, getOrder, getPosition, findWallet, setFollow, schema, type Db } from "@flashmob/db";
import { migrationsFolder } from "@flashmob/db/migrations";
import { USDC_BASE, type FlashClient } from "@flashmob/flash";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { handleOrder, syncOrders, type AlertButton } from "./listener";
import { approvedUser } from "./test-helpers";
import type { OrderFrame } from "./trades";

let db: Db;
let sent: { chatId: number; text: string; button?: AlertButton }[];
let legReads: number;
const send = async (chatId: number, text: string, button?: AlertButton) => void sent.push({ chatId, text, button });
const flash = {
  getOrder: async () => {
    legReads++;
    return { order: { attachedBracket: { stopLoss: { notionalPrice: "1900" }, takeProfit: { notionalPrice: "2500" } } } };
  },
} as unknown as FlashClient;

const TRADER = "0xTrader";
const frame = (over: Partial<OrderFrame> = {}): OrderFrame => ({
  orderId: "o1", orderType: "limit", side: "buy", status: "ORDER_STATUS_ACCEPTED", funderAddress: TRADER.toLowerCase(), qty: "25",
  targetAsset: { ticker: "WETH", address: "0xweth", chain: "base" }, contraAsset: { ticker: "USDC", address: USDC_BASE, chain: "base" },
  filled: null, limitCrossPrice: "2000", placedAt: new Date().toISOString(), ...over,
});
const FOLLOWER_CHAT = 500;
const toFollower = () => sent.filter((m) => m.chatId === FOLLOWER_CHAT).map((m) => m.text);

beforeEach(async () => {
  const pg = drizzle(new PGlite(), { schema });
  await migrate(pg, { migrationsFolder });
  db = pg as unknown as Db;
  sent = [];
  legReads = 0;
  const userId = await getOrCreateWalletUser(db, TRADER);
  const trader = (await createTrader(db, { userId, displayName: "Ana" }))!;
  const follower = await approvedUser(db, FOLLOWER_CHAT);
  await setFollow(db, follower.user.id, trader.id, true);
});

test("followers hear a trade placed, filled and sold, each once", async () => {
  await handleOrder(db, flash, send, frame(), true);
  const filled = frame({ status: "ORDER_STATUS_FILLED", filled: { targetAmount: "0.0125", contraAmount: "25" } });
  await handleOrder(db, flash, send, filled, true);
  await handleOrder(db, flash, send, filled, true);
  await handleOrder(db, flash, send, frame({ orderId: "o2", orderType: "market", side: "sell", status: "ORDER_STATUS_FILLED", qty: "0.0125", filled: { targetAmount: "0.0125", contraAmount: "30" } }), true);
  assert.deepEqual(toFollower(), ["🕓 <b>Ana placed a limit buy of WETH</b>\n<pre>Size   $25\nPrice  $2,000</pre>", "🟢 <b>Ana bought WETH</b>\n<pre>Size   $25\nPrice  $2,000</pre>", "🔴 <b>Ana sold WETH</b>\n<pre>Size    $30\nPrice   $2,400\nResult  +20.0%</pre>"]);
});

test("a trader's cancel reaches followers", async () => {
  await handleOrder(db, flash, send, frame(), true);
  await handleOrder(db, flash, send, frame({ status: "ORDER_STATUS_CANCELLED" }), true);
  assert.equal(toFollower().at(-1), "⚪ <b>Ana cancelled their limit buy of WETH</b>");
});

test("a reconnect snapshot updates state but sends nothing", async () => {
  await handleOrder(db, flash, send, frame({ status: "ORDER_STATUS_PARTIALLY_FILLED", filled: { targetAmount: "0.005", contraAmount: "10" } }), false);
  assert.equal(sent.length, 0);
  const wallet = (await findWallet(db, TRADER))!;
  assert.equal((await getPosition(db, wallet.id, "0xweth"))!.qty, 0.005);
});

test("an attached stop and target are read once and kept", async () => {
  const attached = { attachedBracket: { status: "pending_activation", bracketOrderId: null } };
  await handleOrder(db, flash, send, frame(attached), true);
  await handleOrder(db, flash, send, frame({ ...attached, status: "ORDER_STATUS_PARTIALLY_FILLED" }), true);
  const order = (await getOrder(db, "o1"))!;
  assert.deepEqual([order.stopPrice, order.targetPrice, legReads], [1900, 2500, 1]);
  assert.match(toFollower()[0]!, /Stop    \$1,900\nTarget  \$2,500/);
});

test("orders from non-traders stay private and silent", async () => {
  await getOrCreateWalletUser(db, "0xPlain");
  await handleOrder(db, flash, send, frame({ orderId: "p1", funderAddress: "0xplain" }), true);
  assert.equal((await getOrder(db, "p1"))!.isPublic, false);
  assert.deepEqual(toFollower(), []);
});

test("orders from unknown wallets are ignored", async () => {
  await handleOrder(db, flash, send, frame({ orderId: "u1", funderAddress: "0xnobody" }), true);
  assert.equal(await getOrder(db, "u1"), undefined);
});

test("when a trader sells, a copier gets a prompt that opens the right place", async () => {
  const bought = { status: "ORDER_STATUS_FILLED", orderType: "market", filled: { targetAmount: "2", contraAmount: "4000" } };
  await handleOrder(db, flash, send, frame(bought), true);

  const { user, wallet } = await approvedUser(db, FOLLOWER_CHAT);
  await handleOrder(db, flash, send, frame({ orderId: "c1", funderAddress: wallet.address, status: "ORDER_STATUS_FILLED", orderType: "market", filled: { targetAmount: "0.02", contraAmount: "40" } }), true);
  const copy = (await reserveCopy(db, { sourceOrderId: "o1", userId: user.id, walletId: wallet.id, amountUsd: 40 }))!;
  await confirmCopy(db, copy.id, user.id, "c1");

  const sold = frame({ orderId: "s1", orderType: "market", side: "sell", status: "ORDER_STATUS_FILLED", qty: "1", filled: { targetAmount: "1", contraAmount: "2400" } });
  await handleOrder(db, flash, send, sold, true);
  await handleOrder(db, flash, send, sold, true);

  const prompts = sent.filter((m) => m.button?.label === "Review sale");
  assert.equal(prompts.length, 1);
  assert.match(prompts[0]!.text, /Ana sold 50% of their WETH[\s\S]*Your share  0\.01 WETH[\s\S]*Sell the same share of your copy\?/);
  assert.equal(prompts[0]!.button!.opens, "miniApp");
});

test("buy alerts carry a Copy button, and sells don't", async () => {
  await handleOrder(db, flash, send, frame({ status: "ORDER_STATUS_FILLED", orderType: "market", filled: { targetAmount: "1", contraAmount: "2000" } }), true);
  await handleOrder(db, flash, send, frame({ orderId: "o2", orderType: "market", side: "sell", status: "ORDER_STATUS_FILLED", filled: { targetAmount: "1", contraAmount: "2100" } }), true);
  const [buy, sell] = sent.filter((m) => m.chatId === FOLLOWER_CHAT);
  assert.deepEqual(buy!.button, { label: "Copy", path: "/trades/o1", opens: "miniApp" });
  assert.equal(sell!.button, undefined);
});

const syncFlash = (orders: unknown[]) => ({ ...flash, listOrders: async () => ({ orders }) }) as unknown as FlashClient;
const rest = (over: object = {}) => ({
  ...frame({ orderType: "market", status: "ORDER_STATUS_FILLED", filled: { targetAmount: "0.5", contraAmount: "1000" } }),
  targetAsset: { ticker: "WETH", address: "0xweth", chain: { id: "8453", name: "base", namespace: "eip155" } },
  placedAt: new Date().toISOString(), closedAt: new Date().toISOString(), ...over,
});

test("sync catches a fill the stream missed, and followers hear about it", async () => {
  await syncOrders(db, syncFlash([rest()]), send);
  const wallet = (await findWallet(db, TRADER))!;
  assert.equal((await getPosition(db, wallet.id, "0xweth"))!.qty, 0.5);
  assert.deepEqual(toFollower(), ["🟢 <b>Ana bought WETH</b>\n<pre>Size   $1,000\nPrice  $2,000</pre>"]);
});

test("syncing the same order again changes nothing and stays quiet", async () => {
  await syncOrders(db, syncFlash([rest()]), send);
  await syncOrders(db, syncFlash([rest()]), send);
  const wallet = (await findWallet(db, TRADER))!;
  assert.equal((await getPosition(db, wallet.id, "0xweth"))!.qty, 0.5);
  assert.equal(toFollower().length, 1);
});

test("an order the stream already handled isn't repeated by sync", async () => {
  await handleOrder(db, flash, send, frame({ orderType: "market", status: "ORDER_STATUS_FILLED", filled: { targetAmount: "0.5", contraAmount: "1000" } }), true);
  await syncOrders(db, syncFlash([rest()]), send);
  assert.equal(toFollower().length, 1);
});

test("a stale read can't take a filled order back, so its owner hears about the fill once", async () => {
  const owner = await approvedUser(db, 700);
  const funderAddress = owner.wallet.address;
  const filled = frame({ funderAddress, orderType: "market", status: "ORDER_STATUS_FILLED", filled: { targetAmount: "0.5", contraAmount: "1000" } });
  await handleOrder(db, flash, send, filled, true);
  await syncOrders(db, syncFlash([frame({ funderAddress, orderType: "market" })]), send);
  await syncOrders(db, syncFlash([filled]), send);
  assert.equal(sent.filter((m) => m.chatId === 700).length, 1);
  assert.equal((await getOrder(db, "o1"))?.status, "ORDER_STATUS_FILLED");
});

test("a buy paid with another token still records its cost, even if the first frame has no price", async () => {
  const wallet = (await findWallet(db, TRADER))!;
  const contraAsset = { ticker: "AERO", address: "0xaero", chain: "base" };
  const unpriced = frame({ orderType: "market", status: "ORDER_STATUS_FILLED", contraAsset, filled: { targetAmount: "0.5", contraAmount: "1500" } });
  await handleOrder(db, flash, send, unpriced, true);
  assert.equal(await getPosition(db, wallet.id, "0xweth"), undefined);
  await syncOrders(db, syncFlash([frame({ orderType: "market", status: "ORDER_STATUS_FILLED", contraAsset, filled: { targetAmount: "0.5", contraAmount: "1500", averageNotionalPrice: "2000" } })]), send);
  const held = (await getPosition(db, wallet.id, "0xweth"))!;
  assert.deepEqual([held.qty, held.costUsd], [0.5, 1000]);
});

test("an alert is delivered once, even if the order is seen fresh again after a restart", async () => {
  const filled = frame({ orderType: "market", status: "ORDER_STATUS_FILLED", filled: { targetAmount: "1", contraAmount: "2000" } });
  await handleOrder(db, flash, send, filled, true);
  await handleOrder(db, flash, send, frame({ orderType: "market", status: "ORDER_STATUS_ACCEPTED" }), true);
  await handleOrder(db, flash, send, filled, true);
  assert.equal(toFollower().filter((t) => t.includes("bought")).length, 1);
});

test("a swap out of a token still reaches copiers, valued from the order itself", async () => {
  const priced = { targetAmount: "1", contraAmount: "0.05", averageNotionalPrice: "2400" };
  const reads = { ...flash, getOrder: async () => ({ order: { filled: priced } }) } as unknown as FlashClient;
  await handleOrder(db, flash, send, frame({ status: "ORDER_STATUS_FILLED", orderType: "market", filled: { targetAmount: "2", contraAmount: "4000" } }), true);
  const copier = await approvedUser(db, 900);
  await handleOrder(db, flash, send, frame({ orderId: "c1", funderAddress: copier.wallet.address, status: "ORDER_STATUS_FILLED", orderType: "market", filled: { targetAmount: "0.02", contraAmount: "40" } }), true);
  const copy = (await reserveCopy(db, { sourceOrderId: "o1", userId: copier.user.id, walletId: copier.wallet.id, amountUsd: 40 }))!;
  await confirmCopy(db, copy.id, copier.user.id, "c1");
  const swap = frame({ orderId: "s1", orderType: "market", side: "sell", status: "ORDER_STATUS_FILLED", qty: "1", contraAsset: { ticker: "cbBTC", address: "0xbtc", chain: "base" }, filled: { targetAmount: "1", contraAmount: "0.05" } });
  await handleOrder(db, reads, send, swap, true);
  assert.equal((await getOrder(db, "s1"))!.filledUsd, 2400);
  assert.equal(sent.filter((m) => m.chatId === 900 && m.button?.label === "Review sale").length, 1);
  assert.ok(toFollower().some((t) => t.includes("swapped WETH for cbBTC")));
});

test("a subscriber's size limits decide which trades alert them", async () => {
  const trader = (await getTraderByUser(db, (await findWallet(db, TRADER))!.userId))!;
  const follower = await getOrCreateTelegramAccount(db, { id: FOLLOWER_CHAT });
  await setAlertLimits(db, follower.id, trader.id, { minUsd: 50, maxUsd: 500 });
  const trade = (orderId: string, usd: string) => frame({ orderId, orderType: "market", status: "ORDER_STATUS_FILLED", filled: { targetAmount: "1", contraAmount: usd } });
  await handleOrder(db, flash, send, trade("small", "10"), true);
  await handleOrder(db, flash, send, trade("fits", "100"), true);
  await handleOrder(db, flash, send, trade("large", "900"), true);
  assert.equal(toFollower().length, 1);
  assert.match(toFollower()[0]!, /\$100/);
});

test("old orders found after a restart are recorded but never alert", async () => {
  const old = new Date(Date.now() - 3600_000).toISOString();
  await syncOrders(db, syncFlash([rest({ placedAt: old, closedAt: old })]), send);
  assert.ok(await getOrder(db, "o1"));
  assert.deepEqual(toFollower(), []);
});

test("sync applies orders oldest first, so a buy lands before its sale", async () => {
  const sell = rest({ orderId: "o2", side: "sell", filled: { targetAmount: "0.5", contraAmount: "1200" } });
  await syncOrders(db, syncFlash([sell, rest()]), send);
  assert.equal((await getOrder(db, "o2"))!.realizedUsd, 200);
});
