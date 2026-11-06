import { autoSpentLast24h, enqueueJob, getBotWallet, isCopyOrder, listAutoCopiers, reserveCopy, type Db, type schema } from "@flashmob/db";
import {
  BASE_TOKENS, buildOrder, copyForm, decideCopy, USDC_BASE,
  type CopyableTrade, type CopySettings, type FlashClient, type TradeForm,
} from "@flashmob/flash";

export interface AutoCopy {
  /** The master switch. Nothing is copied automatically unless this is on. */
  enabled: boolean;
  searchFlash: FlashClient;
}

type Order = typeof schema.orders.$inferSelect;
type Send = (chatId: number, text: string) => Promise<void>;

async function tradeFrom(flash: FlashClient, order: Order, funder: string): Promise<CopyableTrade> {
  const raw = order.raw as { trigger?: { notionalPrice?: string; crossPrice?: string; triggerType: "upper" | "lower" } | null; trailingStop?: { trailPercent: string; activationPrice: string | null } } | null;
  const price = raw?.trigger?.notionalPrice ?? raw?.trigger?.crossPrice;
  let twapMinutesLeft: number | null = null;
  if (order.orderType === "twap") {
    const expires = await flash.getOrder(order.id, funder).then((r) => r.order.expiresAt).catch(() => null);
    twapMinutesLeft = expires ? (Date.parse(expires) - Date.now()) / 60_000 : null;
  }
  return {
    side: order.side, status: order.status, orderType: order.orderType, limitPrice: order.limitPrice, stopPrice: order.stopPrice, targetPrice: order.targetPrice,
    filledQty: order.filledQty, filledUsd: order.filledUsd, twapMinutesLeft,
    trigger: price && raw?.trigger ? { price, direction: raw.trigger.triggerType } : null,
    trail: raw?.trailingStop ? { percent: raw.trailingStop.trailPercent, activationPrice: raw.trailingStop.activationPrice } : null,
  };
}

/** A token we can't check counts as flagged, so the "skip risky tokens" setting fails safe. */
async function isFlagged(search: FlashClient, address: string) {
  if (BASE_TOKENS.some((t) => t.address.toLowerCase() === address.toLowerCase())) return false;
  const { assets } = await search.search(address, { chain: "base", limit: 1 }).catch(() => ({ assets: [] }));
  return assets[0]?.riskFlagged ?? true;
}

/** Queues a copy for each follower with auto-copy on. The worker's job runner places them. */
export async function autoCopy(db: Db, flash: FlashClient, auto: AutoCopy, send: Send, order: Order, trader: { id: string; displayName: string; userId: string }, funder: string) {
  if (!auto.enabled || !order.tokenAddress || !order.tokenSymbol) return;
  const copiers = await listAutoCopiers(db, trader.id);
  if (!copiers.length || (await isCopyOrder(db, order))) return;

  const probe = await flash.quote({ targetChain: "base", contraChain: "base", targetAsset: order.tokenAddress, contraAsset: USDC_BASE, side: "buy", qty: "10", orderType: "market" });
  const price = Number(probe.from.notional) / Number(probe.to.amount);
  const tokenFlagged = await isFlagged(auto.searchFlash, order.tokenAddress);
  const trade = await tradeFrom(flash, order, funder);

  for (const copier of copiers) {
    if (copier.paused || copier.userId === trader.userId) continue;
    const wallet = await getBotWallet(db, copier.userId);
    if (!wallet) continue;
    const tell = (text: string) => (copier.telegramId ? send(copier.telegramId, text) : Promise.resolve());

    const settings = copier.settings as CopySettings;
    const { balances } = await flash.balances(wallet.address);
    const usdc = balances.find((b) => b.chain === "base" && b.address.toLowerCase() === USDC_BASE.toLowerCase());
    const decision = decideCopy(settings, trade, {
      price, tokenFlagged, tokenSymbol: order.tokenSymbol,
      usdcBalance: Number(usdc?.balance ?? 0),
      spentLast24hUsd: await autoSpentLast24h(db, copier.userId, trader.userId),
    });
    if ("skip" in decision) {
      await tell(`Skipped copying ${trader.displayName}: ${decision.skip}`);
      continue;
    }

    const qty = String(decision.amountUsd);
    const form = copyForm(trade, { qty, stop: decision.stop, target: decision.target });
    const built = buildOrder({ ...form, maxSlippagePercent: decision.maxSlippagePercent, tokenAddress: order.tokenAddress, funder: wallet.address } as TradeForm);
    if ("error" in built) {
      await tell(`Skipped copying ${trader.displayName}: ${built.error}`);
      continue;
    }

    const copy = await reserveCopy(db, {
      sourceOrderId: order.id, userId: copier.userId, walletId: wallet.id, amountUsd: decision.amountUsd, auto: true,
      stopPrice: decision.stop ? Number(decision.stop) : null, targetPrice: decision.target ? Number(decision.target) : null,
    });
    if (copy) await enqueueJob(db, { userId: copier.userId, walletId: wallet.id, kind: "order", payload: { request: built.request, copyId: copy.id, label: `${trader.displayName}'s ${order.tokenSymbol} trade` } });
  }
}
