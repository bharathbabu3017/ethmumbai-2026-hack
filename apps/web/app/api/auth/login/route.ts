import { getOrCreateWalletUser } from "@flashmob/db";
import { NextResponse, type NextRequest } from "next/server";
import { getAddress, isAddress, verifyMessage } from "viem";
import { db } from "@/lib/db";
import { isValidLoginMessage } from "@/lib/login";
import { startSession } from "@/lib/session";

export async function POST(req: NextRequest) {
  const { address, message, signature } = await req.json();
  const host = req.headers.get("host") ?? "";
  if (typeof address !== "string" || !isAddress(address) || typeof message !== "string" || !isValidLoginMessage(message, host, address)) {
    return NextResponse.json({ error: "Invalid sign-in message" }, { status: 400 });
  }
  const valid = await verifyMessage({ address, message, signature }).catch(() => false);
  if (!valid) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  await getOrCreateWalletUser(db(), getAddress(address));
  await startSession(getAddress(address));
  return NextResponse.json({ ok: true });
}
