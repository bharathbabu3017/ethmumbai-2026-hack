import { countAgents, createAgent, getTraderByName, listAgents } from "@flashmob/db";
import { agentSettingsError, MAX_AGENTS_PER_USER, type AgentSettings } from "@flashmob/flash";
import { PrivyClient } from "@privy-io/node";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { rateLimited } from "@/lib/rate-limit";
import { getSession, sameOrigin, unauthorized } from "@/lib/session";

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function GET() {
  const session = await getSession();
  if (!session) return unauthorized();
  return NextResponse.json({ agents: await listAgents(db(), session.userId) });
}

/** Creates an agent and its own empty wallet. Nothing can trade until the owner funds it. */
export async function POST(req: NextRequest) {
  const limited = rateLimited(req, "auth");
  if (limited) return limited;
  if (!sameOrigin(req)) return fail("Not allowed", 403);
  const session = await getSession();
  if (!session) return unauthorized();

  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;
  const signerId = process.env.NEXT_PUBLIC_PRIVY_SIGNER_ID;
  if (!appId || !appSecret || !signerId) return fail("Agent wallets aren't set up yet.", 503);

  const body = await req.json();
  const name = String(body.name ?? "").trim();
  const settings: AgentSettings = {
    strategy: body.strategy, style: String(body.style ?? "").trim(), tokens: Array.isArray(body.tokens) ? body.tokens.map(String) : [],
    budgetUsd: Number(body.budgetUsd), maxTradeUsd: Number(body.maxTradeUsd), everyMinutes: Number(body.everyMinutes),
  };
  if (name.length < 2 || name.length > 32) return fail("Give it a name between 2 and 32 characters.", 400);
  const problem = agentSettingsError(settings);
  if (problem) return fail(problem, 400);
  if ((await countAgents(db(), session.userId)) >= MAX_AGENTS_PER_USER) return fail(`You can have up to ${MAX_AGENTS_PER_USER} agents.`, 409);
  if (await getTraderByName(db(), name)) return fail("That name is taken.", 409);

  // Our signer owns this wallet, so only this server can sign for it, and only within the agent's limits.
  const wallet = await new PrivyClient({ appId, appSecret }).wallets().create({ chain_type: "ethereum", owner_id: signerId, display_name: `agent-${name}`.slice(0, 64) });
  const agent = await createAgent(db(), { ownerId: session.userId, name, settings, address: wallet.address, privyWalletId: wallet.id });
  return NextResponse.json({ agent });
}
