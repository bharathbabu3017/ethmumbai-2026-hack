import { createDb } from "@flashmob/db";
import { createFlashClient, PUBLIC_DEV_KEY } from "@flashmob/flash";
import { parseMasterKey } from "@flashmob/signer";
import { createBot } from "./bot";
import { startListener } from "./listener";

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name}`);
  return value;
}

const db = createDb(required("DATABASE_URL"));
const apiKey = required("FLASH_API_KEY");

const flash = createFlashClient({ apiKey });

const bot = createBot({
  token: required("BOT_TOKEN"),
  db,
  flash,
  searchFlash: createFlashClient({ apiKey: process.env.FLASH_SEARCH_KEY || PUBLIC_DEV_KEY }),
  masterKey: parseMasterKey(process.env.WALLET_MASTER_KEY),
  feeBps: process.env.PLATFORM_FEE_BPS ?? "10",
  rpcUrl: process.env.BASE_RPC_URL,
});

await bot.api.setMyCommands([
  { command: "balance", description: "Your balances" },
  { command: "buy", description: "Buy a token: /buy WETH 10" },
  { command: "sell", description: "Sell a token: /sell WETH 50%" },
  { command: "limit", description: "Limit buy: /limit WETH 10 2000" },
  { command: "orders", description: "Open orders" },
  { command: "help", description: "All commands" },
]);
// Telegram allows about 30 messages a second, so sends are spaced out.
let sendQueue = Promise.resolve();
const send = (chatId: number, text: string) => {
  const sent = sendQueue.then(async () => {
    await bot.api.sendMessage(chatId, text).catch((e) => console.error("Could not send alert:", e instanceof Error ? e.message : "unknown"));
    await new Promise((r) => setTimeout(r, 40));
  });
  sendQueue = sent;
  return sent;
};
startListener(db, flash, send, apiKey);

console.log("Bot running");
await bot.start();
