import { enqueueJob } from "@flashmob/db";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { rateLimited } from "@/lib/rate-limit";
import { getSession, sameOrigin, unauthorized } from "@/lib/session";

const KINDS = ["order", "cancel", "cancelMany", "update"];

/** Asks the worker to act on the signed-in Telegram wallet. The worker repeats every safety check. */
export async function POST(req: NextRequest) {
  const limited = rateLimited(req, "order");
  if (limited) return limited;
  if (!sameOrigin(req)) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const session = await getSession();
  if (!session) return unauthorized();
  if (session.walletType !== "bot") return NextResponse.json({ error: "Only the Telegram app can use this wallet." }, { status: 403 });
  const { kind, payload } = await req.json();
  if (!KINDS.includes(kind) || typeof payload !== "object" || !payload) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const id = await enqueueJob(db(), { userId: session.userId, walletId: session.walletId, kind, payload });
  return NextResponse.json({ id });
}
