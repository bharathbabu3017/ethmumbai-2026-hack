import { createDb } from "@flashmob/db";
import { createFlashClient, PUBLIC_DEV_KEY } from "@flashmob/flash";
import { parseMasterKey } from "@flashmob/signer";
import { run } from "@grammyjs/runner";
import { createBot } from "./bot";
import { InlineKeyboard } from "grammy";
import { startJobs } from "./jobs";
import { startListener } from "./listener";

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name}`);
  return value;
}

const db = createDb(required("DATABASE_URL"));
const apiKey = required("FLASH_API_KEY");

const flash = createFlashClient({ apiKey });

const masterKey = parseMasterKey(process.env.WALLET_MASTER_KEY);
const feeBps = process.env.PLATFORM_FEE_BPS ?? "10";

const bot = createBot({
  token: required("BOT_TOKEN"),
  db,
  flash,
  searchFlash: createFlashClient({ apiKey: process.env.FLASH_SEARCH_KEY || PUBLIC_DEV_KEY }),
  masterKey,
  feeBps,
  rpcUrl: process.env.BASE_RPC_URL,
});

await bot.api.setMyCommands([
  { command: "balance", description: "Your balances" },
  { command: "buy", description: "Buy: /buy WETH 10" },
  { command: "sell", description: "Sell: /sell WETH 50%" },
  { command: "limit", description: "Limit buy: /limit WETH 10 2000" },
  { command: "limitsell", description: "Limit sell: /limitsell WETH 50% 2500" },
  { command: "stopbuy", description: "Stop buy: /stopbuy WETH 10 2500" },
  { command: "stoploss", description: "Stop loss: /stoploss WETH 50% 1900" },
  { command: "takeprofit", description: "Take profit: /takeprofit WETH 50% 2500" },
  { command: "bracket", description: "Stop and target: /bracket WETH 100% 1900 2500" },
  { command: "twap", description: "TWAP: /twap buy WETH 100 60" },
  { command: "trail", description: "Trailing stop: /trail sell WETH 100% 5" },
  { command: "orders", description: "Pending orders" },
  { command: "cancelall", description: "Cancel all pending orders" },
  { command: "help", description: "All commands" },
]);
// Telegram allows about 30 messages a second, so sends are spaced out.
let sendQueue = Promise.resolve();
// Telegram only opens Mini Apps from https links.
const appUrl = process.env.APP_URL?.startsWith("https://") ? process.env.APP_URL.replace(/\/$/, "") : undefined;
const send = (chatId: number, text: string, copyOrderId?: string) => {
  const reply_markup = appUrl && copyOrderId ? new InlineKeyboard().webApp("Copy", `${appUrl}/mini?next=/trades/${copyOrderId}`) : undefined;
  const sent = sendQueue.then(async () => {
    await bot.api.sendMessage(chatId, text, { reply_markup }).catch((e) => console.error("Could not send alert:", e instanceof Error ? e.message : "unknown"));
    await new Promise((r) => setTimeout(r, 40));
  });
  sendQueue = sent;
  return sent;
};
startListener(db, flash, send, apiKey);
startJobs({ db, flash, masterKey, feeBps, rpcUrl: process.env.BASE_RPC_URL });
if (appUrl) await bot.api.setChatMenuButton({ menu_button: { type: "web_app", text: "Open app", web_app: { url: `${appUrl}/mini` } } });

console.log("Bot running");
const runner = run(bot);
const stop = () => void (runner.isRunning() && runner.stop());
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
await runner.task();
