import { FLASH_BASE_URL, PUBLIC_DEV_KEY } from "@flashmob/flash";
import { NextResponse, type NextRequest } from "next/server";
import { isAllowed, keyFor, withServerFields } from "@/lib/proxy";
import { bucketFor, rateLimited } from "@/lib/rate-limit";

type Params = { params: Promise<{ path: string[] }> };

async function forward(req: NextRequest, { params }: Params) {
  const path = (await params).path.join("/");
  const query = req.nextUrl.searchParams;
  if (!isAllowed(req.method, path, query)) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Not found" } }, { status: 404 });
  }
  const limited = rateLimited(req, bucketFor(req.method, path));
  if (limited) return limited;
  const apiKey = process.env.FLASH_API_KEY;
  if (!apiKey) return NextResponse.json({ error: { code: "NOT_CONFIGURED", message: "Flash key missing" } }, { status: 503 });

  const body = req.method === "GET" ? undefined : withServerFields(path, await req.json(), { feeBps: process.env.PLATFORM_FEE_BPS ?? "10", builderCode: process.env.BUILDER_CODE });
  const res = await fetch(`${FLASH_BASE_URL}/${path}${req.nextUrl.search}`, {
    method: req.method,
    headers: { "content-type": "application/json", "x-definitive-api-key": keyFor(path, apiKey, process.env.FLASH_SEARCH_KEY || PUBLIC_DEV_KEY) },
    body: body && JSON.stringify(body),
  });
  return new NextResponse(await res.text(), { status: res.status, headers: { "content-type": "application/json" } });
}

export { forward as GET, forward as POST, forward as PATCH };
