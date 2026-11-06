import { NextResponse, type NextRequest } from "next/server";

const WINDOW_MS = 60_000;
const MAX_TRACKED = 20_000;

export const LIMITS = {
  order: 20, // placing, cancelling and editing
  quote: 60,
  read: 120,
  search: 60,
  chart: 60,
  auth: 20,
  copy: 30,
} as const;

export type Bucket = keyof typeof LIMITS;

export function createLimiter(now = () => Date.now()) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return function check(key: string, max: number) {
    const time = now();
    const entry = hits.get(key);
    if (!entry || time >= entry.resetAt) {
      if (hits.size >= MAX_TRACKED) hits.clear();
      hits.set(key, { count: 1, resetAt: time + WINDOW_MS });
      return { ok: true, retryAfter: 0 };
    }
    entry.count++;
    return { ok: entry.count <= max, retryAfter: Math.ceil((entry.resetAt - time) / 1000) };
  };
}

/** Maps a Flash call to the limit that protects it. */
export function bucketFor(method: string, path: string): Bucket {
  if (path === "search") return "search";
  if (path === "quote") return "quote";
  return method === "GET" ? "read" : "order";
}

const clientIp = (req: NextRequest) => req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";

const shared = globalThis as unknown as { limiter?: ReturnType<typeof createLimiter> };
const limiter = (shared.limiter ??= createLimiter());

/**
 * Returns a 429 response if this visitor is over the limit, otherwise nothing.
 * Counts live in this server's memory, so several instances each count separately.
 */
export function rateLimited(req: NextRequest, bucket: Bucket) {
  const { ok, retryAfter } = limiter(`${bucket}:${clientIp(req)}`, LIMITS[bucket]);
  if (ok) return null;
  return NextResponse.json(
    { error: { code: "RATE_LIMITED", message: "Too many requests. Try again shortly." } },
    { status: 429, headers: { "Retry-After": String(retryAfter), "RateLimit-Reset": String(retryAfter) } },
  );
}
