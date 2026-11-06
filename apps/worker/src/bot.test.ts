import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { beforeEach, test } from "node:test";
import { migrationsFolder, schema, type Db } from "@flashmob/db";
import type { FlashClient } from "@flashmob/flash";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { createBot } from "./bot";
import { parseBuy, parseLimit, parseSell, sellQty } from "./parse";

const typedData = JSON.stringify({
  domain: { name: "T", chainId: 8453 },
  types: { M: [{ name: "a", type: "uint256" }] },
  primaryType: "M",
  message: { a: "1" },
});

let db: Db;
let sent: { method: string; payload: any }[];
let submits: any[];
let received: string;
let bot: ReturnType<typeof createBot>;
let updateId = 0;

const flash = {
  search: async () => ({ assets: [{ symbol: "WETH", address: "0xweth", riskFlagged: false }] }),
  quote: async () => ({
    quoteId: "q1", recommendedSlippage: "0.15", from: { amount: "10" }, to: { amount: received }, fees: { estimatedFeeNotional: "0.01" },
    evm: { approveTx: null, permitTypedData: "", orderTypedData: typedData },
  }),
  submitOrder: async (body: any) => { submits.push(body); return { orderId: `order-${submits.length}` }; },
} as unknown as FlashClient;

beforeEach(async () => {
  const pg = drizzle(new PGlite(), { schema });
  await migrate(pg, { migrationsFolder });
  db = pg as unknown as Db;
  sent = []; submits = []; received = "0.005";
  bot = createBot({
    token: "1:test", db, flash, masterKey: randomBytes(32), feeBps: "10",
    botInfo: { id: 1, is_bot: true, first_name: "t", username: "t_bot" } as never,
  });
  bot.api.config.use(async (_prev, method, payload) => {
    sent.push({ method, payload });
    const result = method === "sendMessage" ? { message_id: sent.length, date: 0, chat: { id: 7, type: "private" } } : true;
    return { ok: true, result } as never;
  });
});

const from = (id: number) => ({ id, is_bot: false, first_name: "u" });
const say = (text: string, userId = 7, chat: object = { id: userId, type: "private", first_name: "u" }) =>
  bot.handleUpdate({
    update_id: ++updateId,
    message: {
      message_id: updateId, date: 0, chat, from: from(userId), text,
      entities: [{ type: "bot_command", offset: 0, length: text.split(" ")[0]!.length }],
    },
  } as never);
const tap = (data: string, userId = 7) =>
  bot.handleUpdate({
    update_id: ++updateId,
    callback_query: {
      id: String(updateId), chat_instance: "c", data, from: from(userId),
      message: { message_id: 1, date: 0, chat: { id: userId, type: "private", first_name: "u" } },
    },
  } as never);
const confirmData = () => {
  const offer = sent.findLast((m) => m.payload.reply_markup);
  return offer!.payload.reply_markup.inline_keyboard[0][0].callback_data as string;
};
const lastText = () => sent.findLast((m) => m.method === "sendMessage")!.payload.text as string;

test("double-tapping Confirm places exactly one order, with the fee and a signature", async () => {
  await say("/buy WETH 10");
  assert.equal(submits.length, 0);
  assert.match(lastText(), /Max slippage: 15\.0%/);
  const data = confirmData();
  await tap(data);
  await tap(data);
  assert.equal(submits.length, 1);
  assert.equal(submits[0].flashIntegratorFeeBps, "10");
  assert.equal(submits[0].maxSlippage, undefined);
  assert.match(submits[0].userSignature, /^0x/);
  assert.match(lastText(), /already used/);
});

test("another user cannot confirm someone else's order", async () => {
  await say("/buy WETH 10");
  await tap(confirmData(), 8);
  assert.equal(submits.length, 0);
});

test("nothing is placed if the price moved too far after the preview", async () => {
  await say("/buy WETH 10");
  received = "0.0048";
  await tap(confirmData());
  assert.equal(submits.length, 0);
  assert.match(lastText(), /price moved/);
});

test("Cancel on a preview places nothing and uses up the button", async () => {
  await say("/buy WETH 10");
  const data = confirmData();
  await tap(data.replace("ok:", "no:"));
  await tap(data);
  assert.equal(submits.length, 0);
});

test("commands are ignored in groups", async () => {
  await say("/start", 7, { id: -100, type: "group", title: "g" });
  await say("/export", 7, { id: -100, type: "group", title: "g" });
  assert.equal(sent.length, 0);
});

test("export needs a confirm tap and only shows the key once", async () => {
  await say("/export");
  assert.ok(!/0x[0-9a-f]{64}/.test(lastText()));
  const data = confirmData();
  await tap(data);
  assert.match(lastText(), /0x[0-9a-f]{64}/);
  const count = sent.filter((m) => /0x[0-9a-f]{64}/.test(m.payload.text ?? "")).length;
  await tap(data);
  assert.equal(sent.filter((m) => /0x[0-9a-f]{64}/.test(m.payload.text ?? "")).length, count);
});

test("parsing rejects bad input", () => {
  assert.deepEqual(parseBuy("WETH 10"), { token: "WETH", usdc: "10" });
  assert.equal(parseBuy("WETH -5"), null);
  assert.equal(parseBuy("WETH 0"), null);
  assert.equal(parseBuy("WETH"), null);
  assert.equal(parseLimit("WETH 10"), null);
  assert.deepEqual(parseSell("WETH 50%"), { token: "WETH", percent: 50 });
  assert.equal(parseSell("WETH 150%"), null);
});

test("sell amounts round down and never exceed the balance", () => {
  assert.equal(sellQty("1.5", { percent: 100 }), "1.5");
  assert.equal(sellQty("1", { percent: 50 }), "0.5");
  assert.equal(sellQty("1", { qty: "2" }), null);
  assert.ok(Number(sellQty("0.333333333", { percent: 33 })) <= 0.333333333 * 0.33);
});
