import { rateLimited } from "@/lib/rate-limit";
import { NextResponse, type NextRequest } from "next/server";
import { isTimeframe } from "@/lib/chart";
import { getCandles, NoMarketData } from "@/lib/chart-data";

export async function GET(req: NextRequest) {
  const limited = rateLimited(req, "chart");
  if (limited) return limited;
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const timeframe = req.nextUrl.searchParams.get("timeframe");
  if (!/^0x[0-9a-fA-F]{40}$/.test(token) || !isTimeframe(timeframe)) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  try {
    return NextResponse.json({ candles: await getCandles(token, timeframe) });
  } catch (e) {
    if (e instanceof NoMarketData) return NextResponse.json({ error: "No market data for this token" }, { status: 404 });
    return NextResponse.json({ error: "busy" }, { status: 503 }); // the chart retries by itself
  }
}
