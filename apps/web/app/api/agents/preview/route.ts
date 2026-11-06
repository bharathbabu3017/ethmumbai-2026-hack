import { recentBuyers } from "@flashmob/db";
import { agentSettingsError, BASE_TOKENS, checkRules, createFlashClient, entryOrders, exitLabels, judge, planTimeframes, readIndicators, type AgentSettings, type AgentToken, type IndicatorsByTimeframe, type Judgment, type PlanCheck } from "@flashmob/flash";
import { NextResponse, type NextRequest } from "next/server";
import { getCandles } from "@/lib/chart-data";
import { db } from "@/lib/db";
import { rateLimited } from "@/lib/rate-limit";
import { getSession, sameOrigin, unauthorized } from "@/lib/session";

const HOUR_MS = 3_600_000;

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

/** Runs a plan once on live market data. Nothing is placed. */
export async function POST(req: NextRequest) {
  const limited = rateLimited(req, "auth");
  if (limited) return limited;
  if (!sameOrigin(req)) return fail("Not allowed", 403);
  const session = await getSession();
  if (!session) return unauthorized();
  const apiKey = process.env.MODEL_API_KEY;
  if (!apiKey) return fail("Agent previews aren't set up yet.", 503);

  const body = await req.json();
  const settings: AgentSettings = { strategy: "custom", style: String(body.style ?? "").trim(), tokens: Array.isArray(body.tokens) ? body.tokens.map(String) : [], budgetUsd: Number(body.budgetUsd), maxTradeUsd: Number(body.maxTradeUsd), everyMinutes: Number(body.everyMinutes), plan: body.plan };
  const problem = agentSettingsError(settings);
  if (problem) return fail(problem, 400);
  const plan = settings.plan!;

  const flash = createFlashClient({ apiKey: process.env.FLASH_API_KEY ?? "" });
  const usesMob = plan.rules.some((r) => r.metric === "mobBuyers");
  const checks: PlanCheck[] = [];
  let first: { token: AgentToken; read: IndicatorsByTimeframe } | undefined;
  let chosen: typeof first;
  for (const address of settings.tokens) {
    const asset = (await flash.search(address, { chain: "base", limit: 1 }).catch(() => ({ assets: [] }))).assets[0];
    const listed = BASE_TOKENS.find((t) => t.address.toLowerCase() === address.toLowerCase());
    if (asset && Number(asset.price) > 0) {
      const token: AgentToken = { symbol: asset.symbol ?? listed?.symbol ?? address, address, price: Number(asset.price), change24h: Number(asset.priceChange24h ?? 0) * 100, volume24h: Number(asset.volume24h ?? 0), liquidity: Number(asset.liquidity ?? 0), heldQty: 0 };
      const read = await readIndicators(getCandles, address, planTimeframes(plan));
      const mob = usesMob ? await recentBuyers(db(), address, new Date(Date.now() - HOUR_MS)) : 0;
      const result = checkRules(plan, token, read, mob);
      checks.push(...result.checks);
      first ??= { token, read };
      if (result.passed) {
        chosen = { token, read };
        break;
      }
    }
    await new Promise((r) => setTimeout(r, 550)); // Flash allows 2 searches a second
  }
  if (!first) return fail("Couldn't read prices for those tokens.", 502);

  let verdict: Judgment | undefined;
  if (chosen && plan.judgment) {
    verdict = await judge(apiKey, plan.judgment, !!plan.useNews, chosen.token.symbol, checks).catch((): Judgment => ({ pass: false, reason: "It couldn't complete its judgment check, so it would do nothing.", sources: [] }));
    checks.push({ label: plan.judgment, value: verdict.pass ? "Yes" : "No", pass: verdict.pass });
  }
  const buying = !!chosen && (!plan.judgment || !!verdict?.pass);
  const target = chosen ?? first;
  const planned = entryOrders(plan, target.token, target.read, Math.min(settings.maxTradeUsd, settings.budgetUsd));
  const orders = "skip" in planned ? [] : planned.map(({ label, value }) => ({ label, value }));
  const failed = checks.find((c) => !c.pass);
  const reason = "skip" in planned ? planned.skip : verdict?.reason ?? (failed ? `${failed.label} failed: it's ${failed.value}.` : `Its rules passed on ${target.token.symbol}.`);
  return NextResponse.json({ buying: buying && !("skip" in planned), checks, orders, exits: exitLabels(plan.exit), reason, sources: verdict?.sources ?? [] });
}
