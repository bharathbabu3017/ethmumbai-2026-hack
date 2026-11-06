import { NextResponse } from "next/server";
import { getPopularTokens } from "@/lib/popular-tokens";

export async function GET() {
  return NextResponse.json({ assets: await getPopularTokens() });
}
