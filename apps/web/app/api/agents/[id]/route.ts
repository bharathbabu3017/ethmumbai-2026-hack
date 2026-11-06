import { enqueueJob, getJob, getOwnedAgent, setAgentStatus, withdrawalPending } from "@flashmob/db";
import { withdrawalError } from "@flashmob/flash";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { rateLimited } from "@/lib/rate-limit";
import { getSession, sameOrigin, unauthorized } from "@/lib/session";

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
const UUID = /^[0-9a-f-]{36}$/;

/** How a withdrawal went, for the owner who asked for it. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = rateLimited(req, "read");
  if (limited) return limited;
  const session = await getSession();
  if (!session) return unauthorized();
  const { id } = await params;
  const jobId = req.nextUrl.searchParams.get("job") ?? "";
  if (!UUID.test(id) || !UUID.test(jobId)) return fail("Not found", 404);
  const agent = await getOwnedAgent(db(), id, session.userId);
  const job = agent && (await getJob(db(), jobId, agent.userId));
  if (!job) return fail("Not found", 404);
  return NextResponse.json({ status: job.status, error: job.error });
}

/** The owner's controls. Stopping takes effect at once. Funds only ever go back to the signed-in owner's wallet. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = rateLimited(req, "auth");
  if (limited) return limited;
  if (!sameOrigin(req)) return fail("Not allowed", 403);
  const session = await getSession();
  if (!session) return unauthorized();
  const { id } = await params;
  if (!UUID.test(id)) return fail("Agent not found", 404);
  const agent = await getOwnedAgent(db(), id, session.userId);
  if (!agent) return fail("Agent not found", 404);

  const { action, sell, token, amount } = await req.json();
  if (action === "withdraw") {
    const problem = withdrawalError({ token, amount });
    if (problem) return fail(problem, 400);
    if (await withdrawalPending(db(), agent.walletId)) return fail("A withdrawal is already on its way.", 409);
    const jobId = await enqueueJob(db(), { userId: agent.userId, walletId: agent.walletId, kind: "agent-withdraw", payload: { destination: session.address, token, amount } });
    return NextResponse.json({ jobId });
  }
  if (action === "pause" && agent.status === "running") await setAgentStatus(db(), id, "paused");
  else if (action === "resume" && agent.status === "paused") await setAgentStatus(db(), id, "running");
  else if (action === "stop") {
    await setAgentStatus(db(), id, "stopped");
    await enqueueJob(db(), { userId: agent.userId, walletId: agent.walletId, kind: "agent-exit", payload: { destination: session.address, sell: !!sell } });
  } else return fail("That isn't possible right now.", 409);
  return NextResponse.json({ ok: true });
}
