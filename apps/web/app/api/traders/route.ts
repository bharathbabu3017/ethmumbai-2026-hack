import { createTrader } from "@flashmob/db";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSession, unauthorized } from "@/lib/session";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return unauthorized();
  const { displayName, bio, xHandle } = await req.json();
  const name = String(displayName ?? "").trim();
  if (name.length < 2 || name.length > 32) return NextResponse.json({ error: "Name must be 2 to 32 characters" }, { status: 400 });
  const trader = await createTrader(db(), {
    userId: session.userId,
    displayName: name,
    bio: String(bio ?? "").trim().slice(0, 280) || null,
    xHandle: String(xHandle ?? "").trim().replace(/^@/, "").slice(0, 32) || null,
  });
  if (!trader) return NextResponse.json({ error: "That name is taken" }, { status: 409 });
  return NextResponse.json({ trader });
}
