import { copyHistory } from "@flashmob/db";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, unauthorized } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session) return unauthorized();
  return NextResponse.json({ history: await copyHistory(db(), session.userId) });
}
