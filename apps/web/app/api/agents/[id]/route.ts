import { enqueueJob, getOwnedAgent, setAgentStatus } from "@flashmob/db";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { rateLimited } from "@/lib/rate-limit";
import { getSession, sameOrigin, unauthorized } from "@/lib/session";

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

/** The owner's controls. Stopping takes effect at once. Funds only ever go back to the signed-in owner's wallet. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = rateLimited(req, "auth");
  if (limited) return limited;
  if (!sameOrigin(req)) return fail("Not allowed", 403);
  const session = await getSession();
  if (!session) return unauthorized();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return fail("Agent not found", 404);
  const agent = await getOwnedAgent(db(), id, session.userId);
  if (!agent) return fail("Agent not found", 404);

  const { action, sell } = await req.json();
  if (action === "pause" && agent.status === "running") await setAgentStatus(db(), id, "paused");
  else if (action === "resume" && agent.status === "paused") await setAgentStatus(db(), id, "running");
  else if (action === "stop") {
    await setAgentStatus(db(), id, "stopped");
    await enqueueJob(db(), { userId: agent.userId, walletId: agent.walletId, kind: "agent-exit", payload: { destination: session.address, sell: !!sell } });
  } else return fail("That isn't possible right now.", 409);
  return NextResponse.json({ ok: true });
}
