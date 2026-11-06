import { confirmCopy, getCall, getCopy } from "@flashmob/db";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { readOrder } from "@/lib/orders";
import { getSession, unauthorized } from "@/lib/session";

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

/** A copy only counts once Flash confirms the order exists on this wallet, for this token. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return unauthorized();
  const { id } = await params;
  const { orderId } = await req.json();
  if (!/^[0-9a-f-]{36}$/.test(id) || typeof orderId !== "string" || !/^[0-9a-f-]{36}$/.test(orderId)) return fail("Invalid request", 400);

  const copy = await getCopy(db(), id, session.userId);
  const row = copy && (await getCall(db(), copy.callId));
  if (!copy || !row) return fail("Copy not found", 404);

  const order = await readOrder(orderId, session.address);
  const matches =
    order?.funderAddress.toLowerCase() === session.address.toLowerCase() &&
    order.side === "buy" &&
    order.targetAsset.address.toLowerCase() === row.call.tokenAddress.toLowerCase();
  if (!matches) return fail("That order doesn't match this copy", 404);

  const confirmed = await confirmCopy(db(), id, session.userId, orderId).catch(() => undefined);
  if (!confirmed) return fail("This copy was already recorded", 409);
  return NextResponse.json({ ok: true });
}
