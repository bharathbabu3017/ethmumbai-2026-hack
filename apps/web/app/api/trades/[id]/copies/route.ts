import { findWallet, getPosition, getTrade, reserveCopy } from "@flashmob/db";
import { NextResponse, type NextRequest } from "next/server";
import { copyInputError, tradeBlock } from "@/lib/copy";
import { db } from "@/lib/db";
import { currentPrice } from "@/lib/orders";
import { getSession, unauthorized } from "@/lib/session";

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
const level = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

/** Reserves a copy just before the wallet signs. The price and trade state are checked here, not trusted from the browser. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return unauthorized();
  const { id } = await params;
  const row = await getTrade(db(), id);
  if (!row?.order.tokenAddress) return fail("Trade not found", 404);
  if (row.trader.userId === session.userId) return fail("You can't copy your own trade.", 403);

  const body = await req.json();
  const input = { amountUsd: Number(body.amountUsd), stopPrice: level(body.stopPrice), targetPrice: level(body.targetPrice) };
  const [price, held] = await Promise.all([currentPrice(row.order.tokenAddress), getPosition(db(), row.order.walletId, row.order.tokenAddress)]);
  const problem = tradeBlock(row.order, price, (held?.qty ?? 0) > 0) ?? copyInputError(row.order, price, input);
  if (problem) return fail(problem, 409);

  const wallet = await findWallet(db(), session.address);
  if (!wallet) return unauthorized();
  const copy = await reserveCopy(db(), { sourceOrderId: id, userId: session.userId, walletId: wallet.id, ...input });
  if (!copy) return fail("You've already copied this trade, or a copy is in progress.", 409);
  return NextResponse.json({ copyId: copy.id });
}
