import { createDb } from "@flashmob/db";
import { createFlashClient } from "@flashmob/flash";
import { parseMasterKey } from "@flashmob/signer";
import { createBot } from "./bot";

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name}`);
  return value;
}

const bot = createBot({
  token: required("BOT_TOKEN"),
  db: createDb(required("DATABASE_URL")),
  flash: createFlashClient({ apiKey: required("FLASH_API_KEY") }),
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
console.log("Bot running");
await bot.start();
