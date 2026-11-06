import { claimAction, createAction, getBotWallet, getOrCreateTelegramAccount, getOrCreateTelegramUser, getTradingWallet, linkTelegram, recordOrder, setCopyPaused, type Db } from "@flashmob/db";
import { batchCancelMessage, buildOrder, cancelMessage, feeFields, FlashError, OPEN_STATUSES, prepareOrder, resolveBaseToken, submitPrepared, type FlashClient, type OrderRequest, type TradeForm } from "@flashmob/flash";
import { decryptKey, generateBotWallet } from "@flashmob/signer";
import { sequentialize } from "@grammyjs/runner";
import { Bot, InlineKeyboard, type BotConfig, type Context } from "grammy";
import { signerFor, type PrivyAccess } from "./signers";
import { parseBracket, parseBuy, parseLimit, parseSell, parseSellAt, parseStopBuy, parseTimed, sellQty, type SellAmount } from "./parse";

const CHAIN = "base";
// This wallet's key lives on our server, so approvals are sized to each order instead of left unlimited.
const SAFE_APPROVALS = { forceMinimalAllowance: true, evmUsePermit2: true };
const MAX_PRICE_MOVE = 0.02; // abort if a market order got this much worse between preview and confirm
const EXPORT_VISIBLE_MS = 60_000;

const HELP = `Flashmob commands

Buy
/buy WETH 10 - market buy with 10 USDC
/buy WETH 10 stop 1900 target 2500 - with a stop and target
/limit WETH 10 2000 - limit buy, add stop and target the same way
/stopbuy WETH 10 2500 - buy when the price rises to $2,500
/stopbuy WETH 10 1900 dip - buy when it falls to $1,900

Sell (use an amount or a percent)
/sell WETH 50%
/limitsell WETH 0.01 2500
/stoploss WETH 50% 1900
/takeprofit WETH 50% 2500
/bracket WETH 100% 1900 2500 - stop, then target

Over time
/twap buy WETH 100 60 - spend 100 USDC over 60 minutes
/twap sell WETH 50% 60
/trail sell WETH 100% 5 - sell after a 5% drop from the high
/trail buy WETH 100 5 - buy after a 5% rise from the low

Manage
/balance - your balances
/orders - pending orders, with cancel buttons
/cancelall - cancel all pending orders
/pause and /resume - stop or restart all auto-copy
/export - show your wallet's private key`;

export interface BotDeps {
  token: string;
  db: Db;
  flash: FlashClient;
  searchFlash: FlashClient; // token lookup only, see the note in the web proxy
  masterKey: Buffer;
  feeBps: string;
  rpcUrl?: string;
  privy?: PrivyAccess; // when set, wallets come from Privy instead of being generated here
  appUrl?: string;
  botInfo?: BotConfig<Context>["botInfo"];
}

interface OrderPayload {
  request: OrderRequest;
  minReceived?: number;
}

export function createBot({ token, db, flash, searchFlash, masterKey, feeBps, rpcUrl, privy, appUrl, botInfo }: BotDeps) {
  const bot = new Bot(token, { botInfo });
  // Updates run in parallel across people, but stay in order within one chat.
  bot.use(sequentialize((ctx) => ctx.chat?.id.toString()));
  // Wallet details and keys must never appear in a group, so everything is private-chat only.
  const pm = bot.chatType("private");

  const signing = { masterKey, rpcUrl, privy };

  type Profile = { id: number; username?: string };
  const account = (from: Profile) =>
    privy
      ? getOrCreateTelegramAccount(db, { id: from.id, username: from.username }).then((user) => ({ user, created: false }))
      : getOrCreateTelegramUser(db, { id: from.id, username: from.username }, (owner) => generateBotWallet(masterKey, owner));

  // Commands below only run once the wallet check has passed, so a wallet is always there.
  const load = async (from: Profile) => {
    const { user, created } = await account(from);
    const wallet = await getTradingWallet(db, user.id);
    return { user, created, wallet: wallet! };
  };

  const openAppKeyboard = () => (appUrl ? new InlineKeyboard().webApp("Open Flashmob", `${appUrl}/mini`) : undefined);
  const NEEDS_WALLET = "Connect your wallet first. Open the app, log in, and approve Flashmob so the bot can trade for you.";

  // Telegram commands that use a wallet need one the server is allowed to sign with.
  pm.use(async (ctx, next) => {
    const command = ctx.message?.text?.match(/^\/(\w+)/)?.[1];
    if (!ctx.from || command === undefined || command === "start" || command === "help") return next();
    const { user } = await account(ctx.from);
    if (await getTradingWallet(db, user.id)) return next();
    await ctx.reply(NEEDS_WALLET, { reply_markup: openAppKeyboard() });
  });

  const confirmKeyboard = (id: string) => new InlineKeyboard().text("Confirm", `ok:${id}`).text("Cancel", `no:${id}`);

  const friendly = (e: unknown) => (e instanceof FlashError ? e.message : "Something went wrong");

  pm.command("start", async (ctx) => {
    const { user, wallet, created } = await load(ctx.from);
    if (ctx.match) {
      const result = await linkTelegram(db, ctx.match, user.id);
      const replies = {
        linked: "Your Flashmob account is linked. You'll get alerts here for traders you follow.",
        invalid: "That link has expired or was already used. Create a new one on the website.",
        conflict: "Both accounts are already traders, so they can't be linked.",
      };
      return void (await ctx.reply(replies[result]));
    }
    if (!wallet) return void (await ctx.reply(`Welcome to Flashmob.\n\n${NEEDS_WALLET}\n\n${HELP}`, { reply_markup: openAppKeyboard() }));
    await ctx.reply(
      `${created ? "Your trading wallet is ready." : "Welcome back."}\n\n${wallet.address}\n\n` +
        `Send USDC on Base to this address, plus a little ETH for gas. Only keep what you want to trade with.\n\n${HELP}`,
    );
  });

  pm.command("help", (ctx) => ctx.reply(HELP));

  pm.command("pause", async (ctx) => {
    const { user } = await load(ctx.from);
    await setCopyPaused(db, user.id, true);
    await ctx.reply("Auto-copy is paused for every trader. Open orders stay as they are. Use /resume to turn it back on.");
  });

  pm.command("resume", async (ctx) => {
    const { user } = await load(ctx.from);
    await setCopyPaused(db, user.id, false);
    await ctx.reply("Auto-copy has resumed.");
  });

  pm.command("balance", async (ctx) => {
    const { wallet } = await load(ctx.from);
    const { balances } = await flash.balances(wallet.address);
    if (!balances.length) return void (await ctx.reply(`Nothing here yet. Deposit to:\n${wallet.address}`));
    await ctx.reply(balances.map((b) => `${b.symbol} on ${b.chain}: ${b.balance} ($${Number(b.notional).toFixed(2)})`).join("\n"));
  });

  const riskNote = (flagged: boolean) => (flagged ? "\n\nWarning: this token is flagged as risky or isn't on our list. Check the address carefully." : "");

  /** Builds an order with the same rules as the website, then shows a preview to confirm. */
  async function offer(ctx: Context, form: Omit<TradeForm, "tokenAddress" | "funder">, token: string, describe: (symbol: string, received: string) => string) {
    const from = ctx.from!;
    const { user, wallet } = await load(from);
    const asset = await resolveBaseToken(searchFlash, token);
    if (!asset) return void (await ctx.reply(`Couldn't find ${token} on Base.`));
    const built = buildOrder({ ...form, tokenAddress: asset.address, funder: wallet.address });
    if ("error" in built) return void (await ctx.reply(built.error));
    const request: OrderRequest = { ...built.request, ...feeFields(feeBps), ...SAFE_APPROVALS };
    try {
      const quote = await prepareOrder(flash, wallet.address, request);
      const market = form.type === "market";
      const payload: OrderPayload = { request, minReceived: market ? Number(quote.to.amount) * (1 - MAX_PRICE_MOVE) : undefined };
      const id = await createAction(db, user.id, "order", payload);
      const slippage = quote.recommendedSlippage ? `\nMax slippage: ${(Number(quote.recommendedSlippage) * 100).toFixed(1)}%` : "";
      const exits = form.stop ? `\nStop $${form.stop}, target $${form.target}` : "";
      await ctx.reply(`${describe(asset.symbol, quote.to.amount)}${exits}\nEstimated fees: $${quote.fees.estimatedFeeNotional}${slippage}${riskNote(asset.riskFlagged)}\n\nThis expires in 2 minutes.`, { reply_markup: confirmKeyboard(id) });
    } catch (e) {
      await ctx.reply(`Couldn't get a quote: ${friendly(e)}`);
    }
  }

  /** Turns "50%" or an amount into a quantity of a token the wallet holds on Base. */
  async function sellAmount(ctx: Context, token: string, sell: SellAmount) {
    const { wallet } = await load(ctx.from!);
    const { balances } = await flash.balances(wallet.address);
    const q = token.toLowerCase();
    const row = balances.find((b) => b.chain === CHAIN && !b.isNative && (b.symbol.toLowerCase() === q || b.address.toLowerCase() === q));
    if (!row) return void (await ctx.reply(`You don't hold ${token} on Base.`));
    const qty = sellQty(row.balance, sell);
    if (!qty) return void (await ctx.reply(`You only have ${row.balance} ${row.symbol}.`));
    return { qty, token: row.address };
  }

  pm.command("buy", async (ctx) => {
    const a = parseBuy(ctx.match);
    if (!a) return void (await ctx.reply("Usage: /buy WETH 10, or /buy WETH 10 stop 1900 target 2500"));
    await offer(ctx, { side: "buy", type: "market", qty: a.usdc, stop: a.stop, target: a.target }, a.token, (s, got) => `Buy about ${got} ${s} for ${a.usdc} USDC.`);
  });

  pm.command("limit", async (ctx) => {
    const a = parseLimit(ctx.match);
    if (!a) return void (await ctx.reply("Usage: /limit WETH 10 2000, or add stop 1900 target 2500"));
    await offer(ctx, { side: "buy", type: "limit", qty: a.usdc, price: a.price, stop: a.stop, target: a.target }, a.token, (s) => `Limit buy ${s} with ${a.usdc} USDC at $${a.price} or better.`);
  });

  pm.command("stopbuy", async (ctx) => {
    const a = parseStopBuy(ctx.match);
    if (!a) return void (await ctx.reply("Usage: /stopbuy WETH 10 2500, or /stopbuy WETH 10 1900 dip"));
    await offer(ctx, { side: "buy", type: "stop", qty: a.usdc, trigger: a.trigger, triggerDirection: a.direction }, a.token, (s) => `Buy ${s} with ${a.usdc} USDC when the price ${a.direction === "upper" ? "rises" : "falls"} to $${a.trigger}.`);
  });

  pm.command("sell", async (ctx) => {
    const a = parseSell(ctx.match);
    if (!a) return void (await ctx.reply("Usage: /sell WETH 50% or /sell WETH 0.01"));
    const held = await sellAmount(ctx, a.token, a);
    if (held) await offer(ctx, { side: "sell", type: "market", qty: held.qty }, held.token, (s, got) => `Sell ${held.qty} ${s} for about ${got} USDC.`);
  });

  const sellAt = (command: string, type: "limit" | "stop-loss" | "take-profit", describe: (qty: string, symbol: string, price: string) => string) =>
    pm.command(command, async (ctx) => {
      const a = parseSellAt(ctx.match);
      if (!a) return void (await ctx.reply(`Usage: /${command} WETH 50% 2000`));
      const held = await sellAmount(ctx, a.token, a.sell);
      if (!held) return;
      const prices = type === "limit" ? { price: a.price } : { trigger: a.price };
      await offer(ctx, { side: "sell", type, qty: held.qty, ...prices }, held.token, (s) => describe(held.qty, s, a.price));
    });
  sellAt("limitsell", "limit", (q, s, p) => `Limit sell ${q} ${s} at $${p} or better.`);
  sellAt("stoploss", "stop-loss", (q, s, p) => `Sell ${q} ${s} if the price falls to $${p}.`);
  sellAt("takeprofit", "take-profit", (q, s, p) => `Sell ${q} ${s} if the price rises to $${p}.`);

  pm.command("bracket", async (ctx) => {
    const a = parseBracket(ctx.match);
    if (!a) return void (await ctx.reply("Usage: /bracket WETH 100% 1900 2500 (stop, then target)"));
    const held = await sellAmount(ctx, a.token, a.sell);
    if (held) await offer(ctx, { side: "sell", type: "bracket", qty: held.qty, bracketStop: a.stop, bracketTarget: a.target }, held.token, (s) => `Sell ${held.qty} ${s} at $${a.stop} or $${a.target}, whichever comes first.`);
  });

  const timed = (command: string, usage: string, form: (value: string) => Pick<TradeForm, "type" | "durationMinutes" | "trailPercent">, describe: (value: string) => string) =>
    pm.command(command, async (ctx) => {
      const a = parseTimed(ctx.match);
      if (!a) return void (await ctx.reply(usage));
      if (a.side === "buy") return offer(ctx, { side: "buy", qty: a.usdc!, ...form(a.value) }, a.token, (s) => `Buy ${s} with ${a.usdc} USDC ${describe(a.value)}.`);
      const held = await sellAmount(ctx, a.token, a.sell!);
      if (held) await offer(ctx, { side: "sell", qty: held.qty, ...form(a.value) }, held.token, (s) => `Sell ${held.qty} ${s} ${describe(a.value)}.`);
    });
  timed("twap", "Usage: /twap buy WETH 100 60, or /twap sell WETH 50% 60 (minutes)", (v) => ({ type: "twap", durationMinutes: v }), (v) => `evenly over ${v} minutes`);
  timed("trail", "Usage: /trail sell WETH 100% 5, or /trail buy WETH 100 5 (percent)", (v) => ({ type: "trailing-stop", trailPercent: v }), (v) => `with a ${v}% trailing stop`);

  const showOrders = async (ctx: Context & { from: { id: number; username?: string } }) => {
    const { user, wallet } = await load(ctx.from);
    const { orders } = await flash.listOrders({ funderAddress: wallet.address, statuses: OPEN_STATUSES });
    if (!orders.length) return void (await ctx.reply("No pending orders."));
    for (const o of orders) {
      const id = await createAction(db, user.id, "cancel", { orderId: o.orderId }, 3600);
      const price = o.limitNotionalPrice ? ` at $${o.limitNotionalPrice}` : "";
      await ctx.reply(`${o.orderType} ${o.side} ${o.targetAsset.ticker}, ${o.qty}${price}`, {
        reply_markup: new InlineKeyboard().text("Cancel order", `ok:${id}`),
      });
    }
  };
  pm.command("cancelall", async (ctx) => {
    const { user, wallet } = await load(ctx.from);
    const { orders } = await flash.listOrders({ funderAddress: wallet.address, statuses: OPEN_STATUSES });
    if (!orders.length) return void (await ctx.reply("No pending orders."));
    const orderIds = orders.slice(0, 25).map((o) => o.orderId);
    const id = await createAction(db, user.id, "cancelall", { orderIds });
    await ctx.reply(`Cancel ${orderIds.length} pending order${orderIds.length === 1 ? "" : "s"}?`, { reply_markup: confirmKeyboard(id) });
  });

  pm.command("orders", showOrders);
  pm.command("cancel", showOrders);

  pm.command("export", async (ctx) => {
    const { user } = await load(ctx.from);
    // An older generated wallet stays exportable after moving to Privy, so its funds are never stranded.
    const generated = await getBotWallet(db, user.id);
    if (!generated?.encryptedKey) return void (await ctx.reply("Your wallet is secured by Privy, so Flashmob can't see its key."));
    const id = await createAction(db, user.id, "export", {});
    await ctx.reply("This shows your private key. Anyone who sees it can take your funds, and we can never ask you for it. Show it?", {
      reply_markup: new InlineKeyboard().text("Show my key", `ok:${id}`).text("Cancel", `no:${id}`),
    });
  });

  pm.callbackQuery(/^no:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const { user } = await load(ctx.from);
    await claimAction(db, ctx.match[1]!, user.id);
    await ctx.editMessageText("Cancelled. Nothing was placed.");
  });

  pm.callbackQuery(/^ok:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const { user, wallet } = await load(ctx.from);
    const action = await claimAction(db, ctx.match[1]!, user.id);
    if (!action) return void (await ctx.reply("This expired or was already used. Nothing new was placed."));

    if (action.kind === "order") {
      await ctx.editMessageReplyMarkup();
      const { request, minReceived } = action.payload as OrderPayload;
      try {
        const signer = signerFor(signing, wallet, user.id);
        const quote = await prepareOrder(flash, signer.address, request);
        if (minReceived !== undefined && Number(quote.to.amount) < minReceived) {
          return void (await ctx.reply("The price moved too much since your preview, so nothing was placed. Try again."));
        }
        const { orderId } = await submitPrepared(flash, signer, request, quote);
        await recordOrder(db, { id: orderId, userId: user.id, walletId: wallet.id, request });
        await ctx.reply(`Order placed.\nID: ${orderId}`);
      } catch (e) {
        await ctx.reply(`Order not confirmed: ${friendly(e)}\n\nCheck /orders and /balance before trying again.`);
      }
      return;
    }

    if (action.kind === "cancel") {
      const { orderId } = action.payload as { orderId: string };
      try {
        const message = cancelMessage(orderId);
        const signer = signerFor(signing, wallet, user.id);
        await flash.cancelOrder(orderId, { cancelMessage: message, userSignature: await signer.signMessage(message) });
        await ctx.editMessageText("Order cancelled.");
      } catch (e) {
        await ctx.reply(e instanceof FlashError && e.status === 422 ? "That order already executed or closed." : `Couldn't cancel: ${friendly(e)}`);
      }
      return;
    }

    if (action.kind === "cancelall") {
      const { orderIds } = action.payload as { orderIds: string[] };
      try {
        const message = batchCancelMessage(orderIds);
        const signer = signerFor(signing, wallet, user.id);
        const { results } = await flash.cancelOrders({ orderIds, cancelMessage: message, userSignature: await signer.signMessage(message) });
        await ctx.editMessageText(`Cancelled ${results.filter((r) => r.ok).length} of ${results.length} orders.`);
      } catch (e) {
        await ctx.reply(`Couldn't cancel: ${friendly(e)}`);
      }
      return;
    }

    if (action.kind === "export") {
      const generated = await getBotWallet(db, user.id);
      if (!generated?.encryptedKey) return;
      await ctx.editMessageReplyMarkup();
      const key = decryptKey(generated.encryptedKey, masterKey, user.id);
      const sent = await ctx.reply(`Wallet ${generated.address}\n\n<tg-spoiler>${key}</tg-spoiler>\n\nSave this now. This message deletes itself in 60 seconds.`, { parse_mode: "HTML" });
      setTimeout(() => void ctx.api.deleteMessage(sent.chat.id, sent.message_id).catch(() => {}), EXPORT_VISIBLE_MS).unref();
    }
  });

  // Log only the message: error objects can carry request payloads, which may include a key.
  bot.catch((err) => console.error("Bot error:", err.error instanceof Error ? err.error.message : "unknown"));
  return bot;
}
