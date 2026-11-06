import { releaseCopy } from "@flashmob/db";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSession, unauthorized } from "@/lib/session";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return unauthorized();
  const { id } = await params;
  if (/^[0-9a-f-]{36}$/.test(id)) await releaseCopy(db(), id, session.userId);
  return NextResponse.json({ ok: true });
}
