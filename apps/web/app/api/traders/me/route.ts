import { copiesOfTrader, getTraderByUser, leaderboard } from "@flashmob/db";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, unauthorized } from "@/lib/session";

/** A trader's own dashboard: how many people are following their trades, and which trades were copied. */
export async function GET() {
  const session = await getSession();
  if (!session) return unauthorized();
  const trader = await getTraderByUser(db(), session.userId);
  if (!trader) return NextResponse.json({ trader: null });
  const [[stats], copies] = await Promise.all([leaderboard(db(), [trader.id]), copiesOfTrader(db(), session.userId)]);
  return NextResponse.json({ trader: stats, copies });
}
