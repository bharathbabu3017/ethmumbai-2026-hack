import { getBotWallet, getUserByTelegram } from "@flashmob/db";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { rateLimited } from "@/lib/rate-limit";
import { startSession } from "@/lib/session";
import { verifyInitData } from "@/lib/telegram";

/** Signs a Mini App user in from Telegram's signed launch data. The wallet comes from the bot's /start. */
export async function POST(req: NextRequest) {
  const limited = rateLimited(req, "auth");
  if (limited) return limited;
  const { initData } = await req.json();
  const telegram = typeof initData === "string" && process.env.BOT_TOKEN ? verifyInitData(initData, process.env.BOT_TOKEN) : null;
  if (!telegram) return NextResponse.json({ error: "Open this from Telegram." }, { status: 401 });
  const user = await getUserByTelegram(db(), telegram.id);
  const wallet = user && (await getBotWallet(db(), user.id));
  if (!wallet) return NextResponse.json({ error: "Send /start to the bot first." }, { status: 404 });
  await startSession(wallet.address, true);
  return NextResponse.json({ address: wallet.address });
}
