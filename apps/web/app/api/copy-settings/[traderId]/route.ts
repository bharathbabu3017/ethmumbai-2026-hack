import { getCopySettings, getTrader, getUser, saveCopySettings } from "@flashmob/db";
import { DEFAULT_COPY_SETTINGS, settingsError, type CopySettings } from "@flashmob/flash";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { rateLimited } from "@/lib/rate-limit";
import { getSession, sameOrigin, unauthorized } from "@/lib/session";

type Params = { params: Promise<{ traderId: string }> };
const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
const UUID = /^[0-9a-f-]{36}$/;
const number = (v: unknown, fallback: number) => (v === "" || v === null || v === undefined ? fallback : Number(v));
const optional = (v: unknown) => (v === "" || v === null || v === undefined ? null : Number(v));

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session) return unauthorized();
  const { traderId } = await params;
  if (!UUID.test(traderId)) return fail("Trader not found", 404);
  const [saved, user] = await Promise.all([getCopySettings(db(), session.userId, traderId), getUser(db(), session.userId)]);
  return NextResponse.json({
    settings: { ...DEFAULT_COPY_SETTINGS, ...(saved as Partial<CopySettings> | undefined) },
    telegramLinked: !!user?.telegramId,
    autoCopyLive: process.env.AUTO_COPY_ENABLED === "true",
  });
}

export async function POST(req: NextRequest, { params }: Params) {
  const limited = rateLimited(req, "auth");
  if (limited) return limited;
  if (!sameOrigin(req)) return fail("Not allowed", 403);
  const session = await getSession();
  if (!session) return unauthorized();
  const { traderId } = await params;
  const trader = UUID.test(traderId) ? await getTrader(db(), traderId).catch(() => undefined) : undefined;
  if (!trader) return fail("Trader not found", 404);
  if (trader.userId === session.userId) return fail("You can't copy yourself.", 403);

  const b = await req.json();
  const d = DEFAULT_COPY_SETTINGS;
  const settings: CopySettings = {
    enabled: !!b.enabled,
    sizing: b.sizing,
    amountUsd: number(b.amountUsd, d.amountUsd),
    percentOfBalance: number(b.percentOfBalance, d.percentOfBalance),
    maxPerTradeUsd: number(b.maxPerTradeUsd, d.maxPerTradeUsd),
    dailyCapUsd: number(b.dailyCapUsd, d.dailyCapUsd),
    exits: b.exits,
    stopPercent: optional(b.stopPercent),
    targetPercent: optional(b.targetPercent),
    maxSlippagePercent: optional(b.maxSlippagePercent),
    maxEntryDriftPercent: number(b.maxEntryDriftPercent, d.maxEntryDriftPercent),
    autoSell: !!b.autoSell,
    skipRiskyTokens: !!b.skipRiskyTokens,
    blockedTokens: Array.isArray(b.blockedTokens) ? b.blockedTokens.map(String).map((t: string) => t.trim()).filter(Boolean).slice(0, 50) : [],
  };
  const problem = settingsError(settings);
  if (problem) return fail(problem, 400);
  const user = await getUser(db(), session.userId);
  if (settings.enabled && !user?.telegramId) return fail("Link Telegram first. Auto-copy runs from your Telegram wallet.", 400);
  await saveCopySettings(db(), session.userId, traderId, settings);
  return NextResponse.json({ ok: true });
}
