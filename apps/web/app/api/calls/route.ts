import { createCall, getTraderByUser } from "@flashmob/db";
import { USDC_BASE } from "@flashmob/flash";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { readOrder } from "@/lib/orders";
import { getSession, unauthorized } from "@/lib/session";

/** Every detail of a call comes from Flash's record of the order, so a call can't claim something the order doesn't say. */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return unauthorized();
  const trader = await getTraderByUser(db(), session.userId);
  if (!trader) return NextResponse.json({ error: "Create a trader profile first" }, { status: 403 });

  const { orderId, note } = await req.json();
  if (typeof orderId !== "string") return NextResponse.json({ error: "Missing order" }, { status: 400 });
  const order = await readOrder(orderId, session.address);
  if (!order || order.funderAddress.toLowerCase() !== session.address.toLowerCase()) {
    return NextResponse.json({ error: "Couldn't find that order on your wallet" }, { status: 404 });
  }

  const stop = Number(order.attachedBracket?.stopLoss?.notionalPrice);
  const target = Number(order.attachedBracket?.takeProfit?.notionalPrice);
  const pairedWithUsdc = order.contraAsset.address.toLowerCase() === USDC_BASE.toLowerCase();
  if (order.side !== "buy" || !pairedWithUsdc || !(stop > 0) || !(target > stop)) {
    return NextResponse.json({ error: "A call must be a USDC buy with a stop and target" }, { status: 400 });
  }

  const call = await createCall(db(), {
    traderId: trader.id,
    orderId,
    funderAddress: order.funderAddress,
    chain: "base",
    tokenSymbol: order.targetAsset.ticker,
    tokenAddress: order.targetAsset.address,
    entryType: order.orderType,
    entryPrice: order.limitCrossPrice ? Number(order.limitCrossPrice) : null,
    stopPrice: stop,
    targetPrice: target,
    note: String(note ?? "").trim().slice(0, 280) || null,
  });
  if (!call) return NextResponse.json({ error: "That order is already a call" }, { status: 409 });
  return NextResponse.json({ call, traderId: trader.id });
}
