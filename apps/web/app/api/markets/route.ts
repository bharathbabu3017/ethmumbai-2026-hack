import { NextResponse } from "next/server";
import { getMarkets } from "@/lib/markets";

export async function GET() {
  return NextResponse.json({ markets: await getMarkets() });
}
