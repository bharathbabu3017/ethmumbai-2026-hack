import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { createTrader, getOrCreateTelegramUser, getOrCreateWalletUser, getOrder, getPosition, findWallet, setFollow, schema, type Db } from "@flashmob/db";
import { migrationsFolder } from "@flashmob/db/migrations";
import { USDC_BASE, type FlashClient } from "@flashmob/flash";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { handleOrder } from "./listener";
import type { OrderFrame } from "./trades";

let db: Db;
let sent: { chatId: number; text: string }[];
let legReads: number;
const send = async (chatId: number, text: string) => void sent.push({ chatId, text });
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
  const follower = await getOrCreateTelegramUser(db, { id: FOLLOWER_CHAT }, () => ({ address: "0xbot", encryptedKey: "x" }));
  await setFollow(db, follower.user.id, trader.id, true);
});

test("followers hear a trade placed, filled and sold, each once", async () => {
  await handleOrder(db, flash, send, frame(), true);
  const filled = frame({ status: "ORDER_STATUS_FILLED", filled: { targetAmount: "0.0125", contraAmount: "25" } });
  await handleOrder(db, flash, send, filled, true);
  await handleOrder(db, flash, send, filled, true);
  await handleOrder(db, flash, send, frame({ orderId: "o2", orderType: "market", side: "sell", status: "ORDER_STATUS_FILLED", qty: "0.0125", filled: { targetAmount: "0.0125", contraAmount: "30" } }), true);
  assert.deepEqual(toFollower(), ["Ana placed a limit buy of WETH: $25 at $2,000.", "Ana bought WETH at $2,000.", "Ana sold WETH at $2,400 (+20.0%)."]);
});

test("a trader's cancel reaches followers", async () => {
  await handleOrder(db, flash, send, frame(), true);
  await handleOrder(db, flash, send, frame({ status: "ORDER_STATUS_CANCELLED" }), true);
  assert.equal(toFollower().at(-1), "Ana cancelled their limit buy of WETH.");
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
  assert.match(toFollower()[0]!, /stop \$1,900, target \$2,500/);
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
