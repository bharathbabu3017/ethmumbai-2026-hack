import { findWallet, getCall, reserveCopy } from "@flashmob/db";
import { NextResponse, type NextRequest } from "next/server";
import { callBlock, copyInputError } from "@/lib/copy";
import { db } from "@/lib/db";
import { currentPrice } from "@/lib/orders";
import { getSession, unauthorized } from "@/lib/session";

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

/** Reserves a copy just before the wallet signs. The price is checked here, not trusted from the browser. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return unauthorized();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return fail("Call not found", 404);
  const row = await getCall(db(), id);
  if (!row) return fail("Call not found", 404);
  if (row.trader.userId === session.userId) return fail("You can't copy your own call.", 403);

  const body = await req.json();
  const input = { amountUsd: Number(body.amountUsd), stopPrice: Number(body.stopPrice), targetPrice: Number(body.targetPrice) };
  const price = await currentPrice(row.call.tokenAddress);
  const problem = callBlock(row.call, price) ?? copyInputError(row.call, price, input);
  if (problem) return fail(problem, 409);

  const wallet = await findWallet(db(), session.address);
  if (!wallet) return unauthorized();
  const copy = await reserveCopy(db(), { callId: id, userId: session.userId, walletId: wallet.id, ...input });
  if (!copy) return fail("You've already copied this call, or a copy is in progress.", 409);
  return NextResponse.json({ copyId: copy.id });
}
