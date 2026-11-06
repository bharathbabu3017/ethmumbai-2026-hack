import { TraderProfile } from "@/components/trader-profile";
import { getSession } from "@/lib/session";
import { traderDashboard } from "@/lib/trader-dashboard";

export const dynamic = "force-dynamic";

// The server decides which screen this is, so a trader never sees the sign-up form first.
export default async function BecomeATrader() {
  const session = await getSession();
  return <TraderProfile initial={session ? await traderDashboard(session.userId) : undefined} />;
}
