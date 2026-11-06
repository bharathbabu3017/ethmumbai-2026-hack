import { tokenTraders } from "@flashmob/db";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getTokenStats } from "@/lib/token-stats";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return NextResponse.json({ error: "Not a token address" }, { status: 400 });
  const [stats, traders] = await Promise.all([getTokenStats(address), tokenTraders(db(), address).catch(() => [])]);
  return NextResponse.json({ stats, traders });
}
