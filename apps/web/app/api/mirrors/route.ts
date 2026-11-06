import { getPosition, listMirrors, mirrorExits } from "@flashmob/db";
import { OPEN_STATUSES } from "@flashmob/flash";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { MirrorPrompt } from "@flashmob/flash";
import { getSession, unauthorized } from "@/lib/session";

/** Sell prompts for the signed-in user, with what's needed to carry each one out. */
export async function GET() {
  const session = await getSession();
  if (!session) return unauthorized();
  const prompts: MirrorPrompt[] = [];
  for (const { mirror: m, trader, walletAddress, walletType } of await listMirrors(db(), session.userId)) {
    const held = (await getPosition(db(), m.walletId, m.tokenAddress))?.qty ?? 0;
    if (held <= 0) continue;
    const { pairOrderIds, stop, target } = await mirrorExits(db(), m.walletId, m.tokenAddress, OPEN_STATUSES);
    prompts.push({ id: m.id, trader, tokenSymbol: m.tokenSymbol, tokenAddress: m.tokenAddress, percent: m.percent, qty: m.qty, held, walletAddress, walletType, pairOrderIds, stop, target });
  }
  return NextResponse.json({ prompts });
}
