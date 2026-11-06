import { NextResponse } from "next/server";
import { getSession, unauthorized } from "@/lib/session";
import { traderDashboard } from "@/lib/trader-dashboard";

export async function GET() {
  const session = await getSession();
  if (!session) return unauthorized();
  return NextResponse.json(await traderDashboard(session.userId));
}
