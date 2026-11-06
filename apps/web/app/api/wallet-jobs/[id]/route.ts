import { getJob } from "@flashmob/db";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSession, unauthorized } from "@/lib/session";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return unauthorized();
  const { id } = await params;
  const job = /^[0-9a-f-]{36}$/.test(id) ? await getJob(db(), id, session.userId) : undefined;
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ status: job.status, result: job.result, error: job.error });
}
