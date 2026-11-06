import { NextResponse, type NextRequest } from "next/server";
import { loadCopyTrade } from "@/lib/copy-trade";
import { getSession } from "@/lib/session";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  const found = await loadCopyTrade(id, session?.userId);
  if (!found) return NextResponse.json({ error: "Trade not found" }, { status: 404 });
  const { trader, trade, copyable, myCopy, own } = found;
  return NextResponse.json({ trade, trader: trader.displayName, copyable, own, copiedUsd: myCopy?.amountUsd ?? null });
}
