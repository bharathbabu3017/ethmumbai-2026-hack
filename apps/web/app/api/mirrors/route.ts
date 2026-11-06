import { getOrder, getPosition, listCopyOrders, listMirrors } from "@flashmob/db";
import { OPEN_STATUSES } from "@flashmob/flash";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { MirrorPrompt } from "@/lib/mirror";
import { getSession, unauthorized } from "@/lib/session";

/** Sell prompts for the signed-in user, with what's needed to carry each one out. */
export async function GET() {
  const session = await getSession();
  if (!session) return unauthorized();
  const prompts: MirrorPrompt[] = [];
  for (const { mirror: m, trader, walletAddress, walletType } of await listMirrors(db(), session.userId)) {
    const held = (await getPosition(db(), m.walletId, m.tokenAddress))?.qty ?? 0;
    if (held <= 0) continue;
    const pairOrderIds: string[] = [];
    let stop: number | null = null;
    let target: number | null = null;
    for (const { order } of await listCopyOrders(db(), m.walletId, m.tokenAddress)) {
      const pairId = (order.raw as { attachedBracket?: { bracketOrderId?: string | null } } | null)?.attachedBracket?.bracketOrderId;
      const pair = pairId ? await getOrder(db(), pairId) : undefined;
      if (!pairId || !OPEN_STATUSES.includes(pair?.status ?? "")) continue;
      pairOrderIds.push(pairId);
      stop = pair?.stopPrice ?? order.stopPrice;
      target = pair?.targetPrice ?? order.targetPrice;
    }
    prompts.push({ id: m.id, trader, tokenSymbol: m.tokenSymbol, tokenAddress: m.tokenAddress, percent: m.percent, qty: m.qty, held, walletAddress, walletType, pairOrderIds, stop, target });
  }
  return NextResponse.json({ prompts });
}
