import { setAlertLimits } from "@flashmob/db";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { rateLimited } from "@/lib/rate-limit";
import { getSession, sameOrigin, unauthorized } from "@/lib/session";

const limit = (v: unknown) => (v === "" || v === null || v === undefined ? null : Number(v));

export async function POST(req: NextRequest) {
  const limited = rateLimited(req, "auth");
  if (limited) return limited;
  if (!sameOrigin(req)) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const session = await getSession();
  if (!session) return unauthorized();
  const body = await req.json();
  const minUsd = limit(body.minUsd);
  const maxUsd = limit(body.maxUsd);
  const bad = (n: number | null) => n !== null && !(n >= 0);
  if (typeof body.traderId !== "string" || bad(minUsd) || bad(maxUsd)) return NextResponse.json({ error: "Enter amounts in USD, or leave them empty." }, { status: 400 });
  if (minUsd !== null && maxUsd !== null && minUsd > maxUsd) return NextResponse.json({ error: "The minimum has to be below the maximum." }, { status: 400 });
  await setAlertLimits(db(), session.userId, body.traderId, { minUsd, maxUsd });
  return NextResponse.json({ ok: true });
}
