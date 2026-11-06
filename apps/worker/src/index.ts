import { pruneAlerts, createDb } from "@flashmob/db";
import { askModel, createChartData, createFlashClient, judge, readIndicators } from "@flashmob/flash";
import { createPrivy } from "@flashmob/signer";
import { run } from "@grammyjs/runner";
import { createBot } from "./bot";
import { GrammyError, InlineKeyboard } from "grammy";
import { startAgents } from "./agents";
import { startJobs } from "./jobs";
import { startListener, type AlertButton } from "./listener";

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name}`);
  return value;
}

const db = createDb(required("DATABASE_URL"));
const apiKey = required("FLASH_API_KEY");

const flash = createFlashClient({ apiKey });

const feeBps = process.env.PLATFORM_FEE_BPS ?? "0";

const authorizationKey = required("PRIVY_AUTHORIZATION_KEY");
const privy = {
  client: createPrivy({ appId: required("NEXT_PUBLIC_PRIVY_APP_ID"), appSecret: required("PRIVY_APP_SECRET"), authorizationKey }),
  authorizationKey,
};

// Telegram only opens Mini Apps from https links.
const appUrl = process.env.APP_URL?.startsWith("https://") ? process.env.APP_URL.replace(/\/$/, "") : undefined;

const bot = createBot({
  token: required("BOT_TOKEN"),
  db,
  flash,
  searchFlash: flash,
  feeBps,
  rpcUrl: process.env.BASE_RPC_URL,
  privy,
  appUrl,
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
  { command: "pause", description: "Pause all auto-copy" },
  { command: "resume", description: "Resume auto-copy" },
  { command: "cancelall", description: "Cancel all pending orders" },
  { command: "help", description: "All commands" },
]);
// Telegram allows about 30 messages a second, so sends are spaced out.
let sendQueue = Promise.resolve();
const send = (chatId: number, text: string, button?: AlertButton) => {
  const keyboard = new InlineKeyboard();
  if (appUrl && button?.opens === "miniApp") keyboard.webApp(button.label, `${appUrl}/mini?next=${button.path}`);
  if (appUrl && button?.opens === "website") keyboard.url(button.label, `${appUrl}${button.path}`);
  const reply_markup = appUrl && button ? keyboard : undefined;
  const deliver = () => bot.api.sendMessage(chatId, text, { reply_markup, parse_mode: "HTML", link_preview_options: { is_disabled: true } });
  const sent = sendQueue.then(async () => {
    await deliver().catch(async (e) => {
      // Telegram only says "retry after" when it refused the message, so a retry can't deliver it twice.
      const wait = e instanceof GrammyError ? e.parameters.retry_after : undefined;
      if (!wait) throw e;
      await new Promise((r) => setTimeout(r, wait * 1000));
      await deliver();
    }).catch((e) => console.error("Could not send alert:", e instanceof Error ? e.message : "unknown"));
    await new Promise((r) => setTimeout(r, 40));
  });
  sendQueue = sent;
  return sent;
};
// Nothing copies until a user taps Start. This is an emergency stop for every user at once.
const autoCopyEnabled = process.env.AUTO_COPY_ENABLED !== "false";
console.log(`Auto-copy is ${autoCopyEnabled ? "ON" : "off"}`);
await pruneAlerts(db).catch(() => {});
startListener(db, flash, send, apiKey, { enabled: autoCopyEnabled, searchFlash: flash });
const stopJobs = startJobs({ db, flash, feeBps, rpcUrl: process.env.BASE_RPC_URL, privy, send });
const modelKey = process.env.MODEL_API_KEY;
const getCandles = createChartData();
if (modelKey) {
  startAgents({
    db, flash, searchFlash: flash,
    ask: (settings, context) => askModel(modelKey, settings, context),
    readMarket: (address, timeframes) => readIndicators(getCandles, address, timeframes),
    judge: (plan, symbol, checks) => judge(modelKey, plan.judgment!, !!plan.useNews, symbol, checks),
  });
}
console.log(`Agents are ${modelKey ? "ON" : "off (no MODEL_API_KEY)"}`);
if (appUrl) await bot.api.setChatMenuButton({ menu_button: { type: "web_app", text: "Open app", web_app: { url: `${appUrl}/mini` } } });

console.log("Bot running");
const runner = run(bot);
// A job killed halfway could place an order without recording it, so running jobs finish first.
const stop = async () => {
  console.log("Stopping");
  await Promise.allSettled([runner.isRunning() ? runner.stop() : undefined, stopJobs()]);
  process.exit(0);
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
await runner.task();
