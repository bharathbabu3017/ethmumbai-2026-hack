import { claimMirror, completeMirror, dismissMirror, findWalletById, getMirror, releaseMirror } from "@flashmob/db";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { readOrder } from "@/lib/orders";
import { rateLimited } from "@/lib/rate-limit";
import { getSession, sameOrigin, unauthorized } from "@/lib/session";

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
const UUID = /^[0-9a-f-]{36}$/;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = rateLimited(req, "copy");
  if (limited) return limited;
  if (!sameOrigin(req)) return fail("Not allowed", 403);
  const session = await getSession();
  if (!session) return unauthorized();
  const { id } = await params;
  const { action, orderId } = await req.json();
  if (!UUID.test(id)) return fail("Not found", 404);

  if (action === "dismiss") await dismissMirror(db(), id, session.userId);
  else if (action === "release") await releaseMirror(db(), id, session.userId);
  else if (action === "claim") {
    if (!(await claimMirror(db(), id, session.userId))) return fail("This sale was already handled.", 409);
  } else if (action === "complete") {
    if (typeof orderId !== "string" || !UUID.test(orderId)) return fail("Invalid request", 400);
    const claimed = await claimedMirror(id, session.userId);
    if (!claimed) return fail("Not found", 404);
    const order = await readOrder(orderId, claimed.address);
    const matches = order?.side === "sell" && order.targetAsset.address.toLowerCase() === claimed.tokenAddress.toLowerCase();
    if (!matches) return fail("That order doesn't match this sale", 404);
    const done = await completeMirror(db(), id, session.userId, orderId).catch(() => undefined);
    if (!done) return fail("This sale was already recorded", 409);
  } else return fail("Invalid request", 400);

  return NextResponse.json({ ok: true });
}

async function claimedMirror(id: string, userId: string) {
  const row = await getMirror(db(), id, userId);
  const wallet = row && (await findWalletById(db(), row.walletId));
  return row && wallet ? { address: wallet.address, tokenAddress: row.tokenAddress } : undefined;
}
