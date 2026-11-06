import { NextResponse, type NextRequest } from "next/server";
import { isTimeframe, TIMEFRAMES, toCandles } from "@/lib/chart";

const API = "https://api.geckoterminal.com/api/v2/networks/base";
const headers = { accept: "application/json" };

/** Candles for a Base token from its most liquid pool. Results are cached because the free API allows about 30 calls a minute. */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const timeframe = req.nextUrl.searchParams.get("timeframe");
  if (!/^0x[0-9a-fA-F]{40}$/.test(token) || !isTimeframe(timeframe)) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const pools = await fetch(`${API}/tokens/${token}/pools?page=1`, { headers, next: { revalidate: 3600 } });
  if (!pools.ok) return NextResponse.json({ error: "No market data for this token" }, { status: 404 });
  const pool: string | undefined = (await pools.json()).data?.[0]?.attributes?.address;
  if (!pool) return NextResponse.json({ error: "No market data for this token" }, { status: 404 });

  const { unit, aggregate } = TIMEFRAMES[timeframe];
  const res = await fetch(`${API}/pools/${pool}/ohlcv/${unit}?aggregate=${aggregate}&limit=200&currency=usd&token=${token}`, { headers, next: { revalidate: 60 } });
  if (!res.ok) return NextResponse.json({ error: "Market data is unavailable right now" }, { status: 502 });
  return NextResponse.json({ candles: toCandles((await res.json()).data?.attributes?.ohlcv_list ?? []) });
}
