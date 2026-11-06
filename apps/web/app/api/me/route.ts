import { getTraderByUser, getTradingWallet, getUser, listFollowing, listUserCopies, listUserCopySettings } from "@flashmob/db";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ address: null });
  const [trader, user, following, copies, autoCopies, tradingWallet] = await Promise.all([
    getTraderByUser(db(), session.userId),
    getUser(db(), session.userId),
    listFollowing(db(), session.userId),
    listUserCopies(db(), session.userId),
    listUserCopySettings(db(), session.userId),
    getTradingWallet(db(), session.userId),
  ]);
  return NextResponse.json({ address: session.address, walletType: session.walletType, trader: trader ?? null, telegramLinked: !!user?.telegramId, following, copies, autoCopies, copyPaused: !!user?.copyPaused, tradingWallet: tradingWallet?.address ?? null });
}
