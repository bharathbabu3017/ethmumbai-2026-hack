import { listAgentTraders, tokenTraders } from "@flashmob/db";
import { agentListed } from "@flashmob/flash";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { getTokenStats } from "@/lib/token-stats";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return NextResponse.json({ error: "Not a token address" }, { status: 400 });
  const [stats, traders, session, agents] = await Promise.all([getTokenStats(address), tokenTraders(db(), address).catch(() => []), getSession(), listAgentTraders(db()).catch(() => [])]);
  const unlisted = new Set(agents.filter((a) => !agentListed(a)).map((a) => a.traderId));
  return NextResponse.json({ stats, traders: traders.filter((t) => t.userId !== session?.userId && !unlisted.has(t.traderId)) });
}
