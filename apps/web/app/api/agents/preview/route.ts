import { agentSettingsError, askModel, BASE_TOKENS, checkDecision, createFlashClient, type AgentSettings, type AgentToken } from "@flashmob/flash";
import { NextResponse, type NextRequest } from "next/server";
import { rateLimited } from "@/lib/rate-limit";
import { getSession, sameOrigin, unauthorized } from "@/lib/session";

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

/** One trial decision on live market data. Nothing is placed. */
export async function POST(req: NextRequest) {
  const limited = rateLimited(req, "auth");
  if (limited) return limited;
  if (!sameOrigin(req)) return fail("Not allowed", 403);
  const session = await getSession();
  if (!session) return unauthorized();
  const apiKey = process.env.MODEL_API_KEY;
  if (!apiKey) return fail("Agent previews aren't set up yet.", 503);

  const body = await req.json();
  const settings: AgentSettings = { strategy: body.strategy, style: String(body.style ?? "").trim(), tokens: Array.isArray(body.tokens) ? body.tokens.map(String) : [], budgetUsd: Number(body.budgetUsd), maxTradeUsd: Number(body.maxTradeUsd), everyMinutes: Number(body.everyMinutes) };
  const problem = agentSettingsError(settings);
  if (problem) return fail(problem, 400);

  const flash = createFlashClient({ apiKey: process.env.FLASH_API_KEY ?? "" });
  const tokens: AgentToken[] = [];
  for (const address of settings.tokens) {
    const asset = (await flash.search(address, { chain: "base", limit: 1 }).catch(() => ({ assets: [] }))).assets[0];
    const listed = BASE_TOKENS.find((t) => t.address.toLowerCase() === address.toLowerCase());
    if (asset && Number(asset.price) > 0) {
      tokens.push({ symbol: asset.symbol ?? listed?.symbol ?? address, address, price: Number(asset.price), change24h: Number(asset.priceChange24h ?? 0) * 100, volume24h: Number(asset.volume24h ?? 0), liquidity: Number(asset.liquidity ?? 0), heldQty: 0 });
    }
    await new Promise((r) => setTimeout(r, 550)); // Flash allows 2 searches a second
  }
  if (!tokens.length) return fail("Couldn't read prices for those tokens.", 502);

  const context = { tokens, budgetLeftUsd: settings.budgetUsd, usdcBalance: settings.budgetUsd, openOrders: 0 };
  const decision = await askModel(apiKey, settings, context).catch(() => undefined);
  if (!decision) return fail("The model didn't answer. Try again.", 502);
  const checked = checkDecision(decision, settings, context);
  return NextResponse.json({ decision, refused: "skip" in checked ? checked.skip : null, prices: tokens.map((t) => ({ symbol: t.symbol, price: t.price })) });
}
