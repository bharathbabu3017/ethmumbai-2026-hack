import { createDb } from "@flashmob/db";
import { createFlashClient, PUBLIC_DEV_KEY } from "@flashmob/flash";
import { createPrivy, parseMasterKey } from "@flashmob/signer";
import { run } from "@grammyjs/runner";
import { createBot } from "./bot";
import { InlineKeyboard } from "grammy";
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
const searchFlash = createFlashClient({ apiKey: process.env.FLASH_SEARCH_KEY || PUBLIC_DEV_KEY });

const masterKey = parseMasterKey(process.env.WALLET_MASTER_KEY);
const feeBps = process.env.PLATFORM_FEE_BPS ?? "0";

// Privy wallets are used once all three values are set. Until then, wallets are generated here.
const privyConfig = {
  appId: process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "",
  appSecret: process.env.PRIVY_APP_SECRET ?? "",
  authorizationKey: process.env.PRIVY_AUTHORIZATION_KEY ?? "",
};
const privy = privyConfig.appId && privyConfig.appSecret && privyConfig.authorizationKey
  ? { client: createPrivy(privyConfig), authorizationKey: privyConfig.authorizationKey }
  : undefined;
console.log(`Telegram wallets: ${privy ? "Privy" : "generated"}`);

// Telegram only opens Mini Apps from https links.
const appUrl = process.env.APP_URL?.startsWith("https://") ? process.env.APP_URL.replace(/\/$/, "") : undefined;

const bot = createBot({
  token: required("BOT_TOKEN"),
  db,
  flash,
  searchFlash,
  masterKey,
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
  const sent = sendQueue.then(async () => {
    await bot.api.sendMessage(chatId, text, { reply_markup }).catch((e) => console.error("Could not send alert:", e instanceof Error ? e.message : "unknown"));
    await new Promise((r) => setTimeout(r, 40));
  });
  sendQueue = sent;
  return sent;
};
const autoCopyEnabled = process.env.AUTO_COPY_ENABLED === "true";
console.log(`Auto-copy is ${autoCopyEnabled ? "ON" : "off"}`);
startListener(db, flash, send, apiKey, { enabled: autoCopyEnabled, searchFlash });
startJobs({ db, flash, masterKey, feeBps, rpcUrl: process.env.BASE_RPC_URL, privy, send });
if (appUrl) await bot.api.setChatMenuButton({ menu_button: { type: "web_app", text: "Open app", web_app: { url: `${appUrl}/mini` } } });

console.log("Bot running");
const runner = run(bot);
const stop = () => void (runner.isRunning() && runner.stop());
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
await runner.task();
