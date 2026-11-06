import { setCopyPaused } from "@flashmob/db";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { rateLimited } from "@/lib/rate-limit";
import { getSession, sameOrigin, unauthorized } from "@/lib/session";

export async function POST(req: NextRequest) {
  const limited = rateLimited(req, "auth");
  if (limited) return limited;
  if (!sameOrigin(req)) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const session = await getSession();
  if (!session) return unauthorized();
  const { paused } = await req.json();
  await setCopyPaused(db(), session.userId, !!paused);
  return NextResponse.json({ ok: true });
}
