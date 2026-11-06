import { NextResponse, type NextRequest } from "next/server";
import { getTokenIcon } from "@/lib/token-icons";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return NextResponse.json({ imageUrl: null }, { status: 400 });
  return NextResponse.json({ imageUrl: await getTokenIcon(address) }, { headers: { "cache-control": "private, max-age=86400" } });
}
