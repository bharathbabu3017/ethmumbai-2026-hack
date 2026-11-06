import { createLinkToken } from "@flashmob/db";
import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { rateLimited } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import { getSession, unauthorized } from "@/lib/session";

export async function POST(req: NextRequest) {
  const limited = rateLimited(req, "auth");
  if (limited) return limited;
  const session = await getSession();
  if (!session) return unauthorized();
  const token = randomBytes(24).toString("hex");
  await createLinkToken(db(), token, session.userId);
  return NextResponse.json({ url: `https://t.me/${process.env.BOT_USERNAME ?? "flashmob_trade_bot"}?start=${token}` });
}
