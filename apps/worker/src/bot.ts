import { claimAction, createAction, getOrCreateTelegramUser, linkTelegram, recordOrder, type Db } from "@flashmob/db";
import { batchCancelMessage, cancelMessage, FlashError, prepareOrder, resolveBaseToken, submitPrepared, USDC_BASE as USDC, type FlashClient, type OrderRequest } from "@flashmob/flash";
import { createBotSigner, decryptKey, generateBotWallet } from "@flashmob/signer";
import { Bot, InlineKeyboard, type BotConfig, type Context } from "grammy";
import { base } from "viem/chains";
import { parseBuy, parseLimit, parseSell, sellQty } from "./parse";

const CHAIN = "base";
// This wallet's key lives on our server, so approvals are sized to each order instead of left unlimited.
const SAFE_APPROVALS = { forceMinimalAllowance: true, evmUsePermit2: true };
const MAX_PRICE_MOVE = 0.02; // abort if a market order got this much worse between preview and confirm
const EXPORT_VISIBLE_MS = 60_000;
const OPEN_STATUSES = ["ORDER_STATUS_PENDING", "ORDER_STATUS_ACCEPTED", "ORDER_STATUS_PARTIALLY_FILLED"];

const HELP = `Flashmob commands

/balance - your balances
/buy WETH 10 - buy with 10 USDC
/sell WETH 50% - sell a share, or /sell WETH 0.01
/limit WETH 10 2000 - buy with 10 USDC at $2,000 or better
/orders - open orders, with cancel buttons
/cancelall - cancel all open orders
/export - show your wallet's private key`;

export interface BotDeps {
  token: string;
  db: Db;
  flash: FlashClient;
  searchFlash: FlashClient; // token lookup only, see the note in the web proxy
  masterKey: Buffer;
  feeBps: string;
  rpcUrl?: string;
  botInfo?: BotConfig<Context>["botInfo"];
}

interface OrderPayload {
  request: OrderRequest;
  minReceived?: number;
}

export function createBot({ token, db, flash, searchFlash, masterKey, feeBps, rpcUrl, botInfo }: BotDeps) {
  const bot = new Bot(token, { botInfo });
  // Wallet details and keys must never appear in a group, so everything is private-chat only.
  const pm = bot.chatType("private");

  const load = (from: { id: number; username?: string }) =>
    getOrCreateTelegramUser(db, { id: from.id, username: from.username }, (owner) => generateBotWallet(masterKey, owner));

  const signerFor = (encryptedKey: string | null, userId: string) => {
    if (!encryptedKey) throw new Error("This wallet has no stored key");
    return createBotSigner(encryptedKey, masterKey, userId, base, rpcUrl);
  };

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
    await ctx.reply(
      `${created ? "Your trading wallet is ready." : "Welcome back."}\n\n${wallet.address}\n\n` +
        `Send USDC on Base to this address, plus a little ETH for gas. We hold this wallet's key so it can trade for you, so only keep what you want to trade with.\n\n${HELP}`,
    );
  });

  pm.command("help", (ctx) => ctx.reply(HELP));

  pm.command("balance", async (ctx) => {
    const { wallet } = await load(ctx.from);
    const { balances } = await flash.balances(wallet.address);
    if (!balances.length) return void (await ctx.reply(`Nothing here yet. Deposit to:\n${wallet.address}`));
    await ctx.reply(balances.map((b) => `${b.symbol} on ${b.chain}: ${b.balance} ($${Number(b.notional).toFixed(2)})`).join("\n"));
  });

  async function offerOrder(ctx: Context, userId: string, funder: string, request: OrderRequest, describe: (received: string) => string, market: boolean, warning = "") {
    const quote = await prepareOrder(flash, funder, request);
    const payload: OrderPayload = { request, minReceived: market ? Number(quote.to.amount) * (1 - MAX_PRICE_MOVE) : undefined };
    const id = await createAction(db, userId, "order", payload);
    const slippage = quote.recommendedSlippage ? `\nMax slippage: ${(Number(quote.recommendedSlippage) * 100).toFixed(1)}%` : "";
    await ctx.reply(`${describe(quote.to.amount)}\nEstimated fees: $${quote.fees.estimatedFeeNotional}${slippage}${warning}\n\nThis expires in 2 minutes.`, { reply_markup: confirmKeyboard(id) });
  }

  const riskNote = (flagged: boolean) => (flagged ? "\n\nWarning: this token is flagged as risky or isn't on our list. Check the address carefully." : "");

  pm.command("buy", async (ctx) => {
    const args = parseBuy(ctx.match);
    if (!args) return void (await ctx.reply("Usage: /buy WETH 10"));
    const { user, wallet } = await load(ctx.from);
    const asset = await resolveBaseToken(searchFlash, args.token);
    if (!asset) return void (await ctx.reply(`Couldn't find ${args.token} on Base.`));
    const request: OrderRequest = {
      targetChain: CHAIN, contraChain: CHAIN, targetAsset: asset.address, contraAsset: USDC,
      side: "buy", qty: args.usdc, orderType: "market", flashIntegratorFeeBps: feeBps, ...SAFE_APPROVALS,
    };
    await offerOrder(ctx, user.id, wallet.address, request, (got) => `Buy about ${got} ${asset.symbol} for ${args.usdc} USDC.`, true, riskNote(asset.riskFlagged))
      .catch((e) => ctx.reply(`Couldn't get a quote: ${friendly(e)}`));
  });

  pm.command("limit", async (ctx) => {
    const args = parseLimit(ctx.match);
    if (!args) return void (await ctx.reply("Usage: /limit WETH 10 2000"));
    const { user, wallet } = await load(ctx.from);
    const asset = await resolveBaseToken(searchFlash, args.token);
    if (!asset) return void (await ctx.reply(`Couldn't find ${args.token} on Base.`));
    const request: OrderRequest = {
      targetChain: CHAIN, contraChain: CHAIN, targetAsset: asset.address, contraAsset: USDC,
      side: "buy", qty: args.usdc, orderType: "limit", limitNotionalPrice: args.price, flashIntegratorFeeBps: feeBps, ...SAFE_APPROVALS,
    };
    await offerOrder(ctx, user.id, wallet.address, request, () => `Limit buy ${asset.symbol} with ${args.usdc} USDC at $${args.price} or better.`, false, riskNote(asset.riskFlagged))
      .catch((e) => ctx.reply(`Couldn't get a quote: ${friendly(e)}`));
  });

  pm.command("sell", async (ctx) => {
    const args = parseSell(ctx.match);
    if (!args) return void (await ctx.reply("Usage: /sell WETH 50% or /sell WETH 0.01"));
    const { user, wallet } = await load(ctx.from);
    const { balances } = await flash.balances(wallet.address);
    const q = args.token.toLowerCase();
    const row = balances.find((b) => b.chain === CHAIN && !b.isNative && (b.symbol.toLowerCase() === q || b.address.toLowerCase() === q));
    if (!row) return void (await ctx.reply(`You don't hold ${args.token} on Base.`));
    const qty = sellQty(row.balance, args);
    if (!qty) return void (await ctx.reply(`You only have ${row.balance} ${row.symbol}.`));
    const request: OrderRequest = {
      targetChain: CHAIN, contraChain: CHAIN, targetAsset: row.address, contraAsset: USDC,
      side: "sell", qty, orderType: "market", flashIntegratorFeeBps: feeBps, ...SAFE_APPROVALS,
    };
    await offerOrder(ctx, user.id, wallet.address, request, (got) => `Sell ${qty} ${row.symbol} for about ${got} USDC.`, true)
      .catch((e) => ctx.reply(`Couldn't get a quote: ${friendly(e)}`));
  });

  const showOrders = async (ctx: Context & { from: { id: number; username?: string } }) => {
    const { user, wallet } = await load(ctx.from);
    const { orders } = await flash.listOrders({ funderAddress: wallet.address, statuses: OPEN_STATUSES });
    if (!orders.length) return void (await ctx.reply("No open orders."));
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
    if (!orders.length) return void (await ctx.reply("No open orders."));
    const orderIds = orders.slice(0, 25).map((o) => o.orderId);
    const id = await createAction(db, user.id, "cancelall", { orderIds });
    await ctx.reply(`Cancel ${orderIds.length} open order${orderIds.length === 1 ? "" : "s"}?`, { reply_markup: confirmKeyboard(id) });
  });

  pm.command("orders", showOrders);
  pm.command("cancel", showOrders);

  pm.command("export", async (ctx) => {
    const { user } = await load(ctx.from);
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
        const signer = signerFor(wallet.encryptedKey, user.id);
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
        const signer = signerFor(wallet.encryptedKey, user.id);
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
        const signer = signerFor(wallet.encryptedKey, user.id);
        const { results } = await flash.cancelOrders({ orderIds, cancelMessage: message, userSignature: await signer.signMessage(message) });
        await ctx.editMessageText(`Cancelled ${results.filter((r) => r.ok).length} of ${results.length} orders.`);
      } catch (e) {
        await ctx.reply(`Couldn't cancel: ${friendly(e)}`);
      }
      return;
    }

    if (action.kind === "export") {
      if (!wallet.encryptedKey) return;
      await ctx.editMessageReplyMarkup();
      const key = decryptKey(wallet.encryptedKey, masterKey, user.id);
      const sent = await ctx.reply(`<tg-spoiler>${key}</tg-spoiler>\n\nSave this now. This message deletes itself in 60 seconds.`, { parse_mode: "HTML" });
      setTimeout(() => void ctx.api.deleteMessage(sent.chat.id, sent.message_id).catch(() => {}), EXPORT_VISIBLE_MS).unref();
    }
  });

  // Log only the message: error objects can carry request payloads, which may include a key.
  bot.catch((err) => console.error("Bot error:", err.error instanceof Error ? err.error.message : "unknown"));
  return bot;
}
