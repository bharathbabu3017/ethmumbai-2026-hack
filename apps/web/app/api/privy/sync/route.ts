import { syncPrivyUser } from "@flashmob/db";
import { PrivyClient } from "@privy-io/node";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { identityFrom } from "@/lib/privy-user";
import { rateLimited } from "@/lib/rate-limit";
import { getSession, sameOrigin, startSession } from "@/lib/session";

/** Trusts only Privy's verified token: which wallets a user owns, and whether they approved our signer, come from Privy. */
export async function POST(req: NextRequest) {
  const limited = rateLimited(req, "auth");
  if (limited) return limited;
  if (!sameOrigin(req)) return NextResponse.json({ error: "Not allowed" }, { status: 403 });

  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;
  if (!appId || !appSecret) return NextResponse.json({ error: "Privy isn't fully set up", configured: false }, { status: 503 });

  const { accessToken, active } = await req.json();
  if (typeof accessToken !== "string") return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const privy = new PrivyClient({ appId, appSecret });
  const verified = await privy.utils().auth().verifyAccessToken(accessToken).catch(() => null);
  if (!verified) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

  const identity = identityFrom(await privy.users()._get(verified.user_id));
  await syncPrivyUser(db(), identity);

  const owned = [identity.embedded?.address, ...identity.externalAddresses].filter(Boolean) as string[];
  const address = owned.find((a) => a.toLowerCase() === String(active).toLowerCase()) ?? owned[0];
  const fresh = !(await getSession());
  if (address) await startSession(address, true);
  return NextResponse.json({ delegated: !!identity.embedded?.delegated, fresh });
}
