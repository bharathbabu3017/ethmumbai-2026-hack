import { createLinkToken } from "@flashmob/db";
import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, unauthorized } from "@/lib/session";

export async function POST() {
  const session = await getSession();
  if (!session) return unauthorized();
  const token = randomBytes(24).toString("hex");
  await createLinkToken(db(), token, session.userId);
  return NextResponse.json({ url: `https://t.me/${process.env.BOT_USERNAME ?? "flashmob_trade_bot"}?start=${token}` });
}
