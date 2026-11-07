import { writePlan } from "@flashmob/flash";
import { NextResponse, type NextRequest } from "next/server";
import { rateLimited } from "@/lib/rate-limit";
import { getSession, sameOrigin, unauthorized } from "@/lib/session";

const MAX_TEXT = 800;

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

/** Turns a written strategy into the closest plan it can. Nothing is created or placed. */
export async function POST(req: NextRequest) {
  const limited = rateLimited(req, "auth");
  if (limited) return limited;
  if (!sameOrigin(req)) return fail("Not allowed", 403);
  const session = await getSession();
  if (!session) return unauthorized();
  const apiKey = process.env.MODEL_API_KEY;
  if (!apiKey) return fail("Agent plans aren't set up yet.", 503);

  const text = String((await req.json()).strategy ?? "").trim();
  if (text.length < 10) return fail("Describe what it should do.", 400);
  if (text.length > MAX_TEXT) return fail(`Keep it under ${MAX_TEXT} characters.`, 400);

  const result = await writePlan(apiKey, text).catch(() => undefined);
  if (!result) return fail("The model didn't answer. Try again.", 502);
  if ("error" in result) return NextResponse.json({ refused: result.error, suggestion: result.suggestion ?? null });
  return NextResponse.json(result);
}
