import { copiesOfTrader, getTraderByUser, leaderboard } from "@flashmob/db";
import { db } from "@/lib/db";

/** How many people are following a trader, and which of their trades were copied. */
export async function traderDashboard(userId: string) {
  const trader = await getTraderByUser(db(), userId);
  if (!trader) return { trader: null, copies: [] };
  const [[stats], copies] = await Promise.all([leaderboard(db(), [trader.id]), copiesOfTrader(db(), userId)]);
  return { trader: stats ?? null, copies };
}

export type TraderDashboard = Awaited<ReturnType<typeof traderDashboard>>;
