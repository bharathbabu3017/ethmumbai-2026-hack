import { countCopies, findWalletById, getPosition, getTrade, getUserCopy } from "@flashmob/db";
import { COPYABLE_TYPES, OPEN_STATUSES, type CopyableTrade } from "@flashmob/flash";
import { db } from "@/lib/db";
import { serverFlash } from "@/lib/orders";

export type CopyTrade = CopyableTrade & { id: string; tokenSymbol: string; tokenAddress: string };

/** A public trade and whether this user can copy it. The Copy drawer and the page Telegram links to both use this. */
export async function loadCopyTrade(id: string, userId?: string) {
  const row = await getTrade(db(), id);
  const tokenAddress = row?.order.tokenAddress;
  if (!row || !tokenAddress) return undefined;
  const { order, trader } = row;
  const [copiers, held, myCopy] = await Promise.all([
    countCopies(db(), id),
    getPosition(db(), order.walletId, tokenAddress),
    userId ? getUserCopy(db(), id, userId) : undefined,
  ]);
  const funder = (await findWalletById(db(), order.walletId))?.address ?? "";
  const copyable = order.side === "buy" && COPYABLE_TYPES.includes(order.orderType ?? "") && (order.filledQty > 0 ? (held?.qty ?? 0) > 0 : OPEN_STATUSES.includes(order.status ?? ""));

  // What a copy needs beyond the stored fields, from the order as Flash last reported it.
  const raw = order.raw as { trigger?: { notionalPrice?: string; crossPrice?: string; triggerType: "upper" | "lower" } | null; trailingStop?: { trailPercent: string; activationPrice?: string | null } | null } | null;
  const triggerPrice = raw?.trigger?.notionalPrice ?? raw?.trigger?.crossPrice;
  const expires = copyable && order.orderType === "twap" ? (await serverFlash().getOrder(id, funder).catch(() => undefined))?.order.expiresAt : undefined;

  const trade: CopyTrade = {
    id: order.id, tokenSymbol: order.tokenSymbol!, tokenAddress, side: order.side, status: order.status, orderType: order.orderType,
    limitPrice: order.limitPrice, stopPrice: order.stopPrice, targetPrice: order.targetPrice, filledQty: order.filledQty, filledUsd: order.filledUsd,
    trigger: triggerPrice && raw?.trigger ? { price: triggerPrice, direction: raw.trigger.triggerType } : null,
    trail: raw?.trailingStop ? { percent: raw.trailingStop.trailPercent, activationPrice: raw.trailingStop.activationPrice ?? null } : null,
    twapMinutesLeft: expires ? (Date.parse(expires) - Date.now()) / 60_000 : null,
  };
  return { order, trader, copiers, trade, copyable, myCopy, own: userId === trader.userId };
}
