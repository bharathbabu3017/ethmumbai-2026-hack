import { autoSpentLast24h, copyHistory, getTradingWallet, getUser, listFollowing, listUserCopySettings } from "@flashmob/db";
import { USDC_BASE, type CopySettings } from "@flashmob/flash";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { serverFlash } from "@/lib/orders";
import { getSession, unauthorized } from "@/lib/session";

/** Everything the Copying page shows: each trader you copy or get alerts from, your wallet, and the history. */
export async function GET() {
  const session = await getSession();
  if (!session) return unauthorized();
  const { userId } = session;
  const [history, wallet, user, following, settings] = await Promise.all([
    copyHistory(db(), userId), getTradingWallet(db(), userId), getUser(db(), userId), listFollowing(db(), userId), listUserCopySettings(db(), userId),
  ]);
  const balances = wallet ? (await serverFlash().balances(wallet.address).catch(() => ({ balances: [] }))).balances : [];
  const onBase = (test: (b: (typeof balances)[number]) => boolean) => Number(balances.find((b) => b.chain === "base" && test(b))?.balance ?? 0);

  const alerts = new Map(following.map((t) => [t.id, t]));
  const copying = await Promise.all(settings.filter((s) => s.enabled).map(async (s) => ({
    traderId: s.traderId, displayName: s.displayName, settings: s.settings as CopySettings, alerts: alerts.has(s.traderId),
    minUsd: alerts.get(s.traderId)?.minUsd ?? null, maxUsd: alerts.get(s.traderId)?.maxUsd ?? null,
    spent: await autoSpentLast24h(db(), userId, s.traderUserId),
  })));
  const copied = new Set(copying.map((r) => r.traderId));
  const alertsOnly = following.filter((t) => !copied.has(t.id)).map((t) => ({ traderId: t.id, displayName: t.displayName, settings: null, alerts: true, minUsd: t.minUsd, maxUsd: t.maxUsd, spent: 0 }));

  return NextResponse.json({
    history,
    traders: [...copying, ...alertsOnly],
    tradingWallet: wallet?.address ?? null,
    usdc: onBase((b) => b.address.toLowerCase() === USDC_BASE.toLowerCase()),
    eth: onBase((b) => b.isNative),
    paused: !!user?.copyPaused,
    telegramLinked: !!user?.telegramId,
    masterOn: process.env.AUTO_COPY_ENABLED !== "false",
  });
}
