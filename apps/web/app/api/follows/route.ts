import { getTrader, setFollow } from "@flashmob/db";
import { rateLimited } from "@/lib/rate-limit";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSession, unauthorized } from "@/lib/session";

export async function POST(req: NextRequest) {
  const limited = rateLimited(req, "auth");
  if (limited) return limited;
  const session = await getSession();
  if (!session) return unauthorized();
  const { traderId, on } = await req.json();
  const trader = typeof traderId === "string" ? await getTrader(db(), traderId).catch(() => undefined) : undefined;
  if (!trader) return NextResponse.json({ error: "Trader not found" }, { status: 404 });
  await setFollow(db(), session.userId, trader.id, !!on);
  return NextResponse.json({ ok: true });
}
