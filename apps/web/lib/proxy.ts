const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

const ROUTES: Record<string, RegExp[]> = {
  GET: [/^search$/, /^balances\/[^/]+$/, /^orders$/, new RegExp(`^orders/${UUID}$`)],
  POST: [/^quote$/, /^order$/, /^orders\/cancel$/, new RegExp(`^orders/${UUID}/cancel$`)],
  PATCH: [new RegExp(`^orders/${UUID}$`)],
};

/** Only these Flash calls are reachable from the browser. */
export function isAllowed(method: string, path: string, query: URLSearchParams) {
  if (!ROUTES[method]?.some((r) => r.test(path))) return false;
  // Without a funder, GET /orders returns every user's orders under our key.
  if (method === "GET" && path === "orders" && !query.get("funderAddress")) return false;
  return true;
}

/** The platform fee and builder code are set here, so the browser can't change them. */
export function withServerFields(path: string, body: Record<string, unknown>, { feeBps, builderCode }: { feeBps: string; builderCode?: string }) {
  if (path === "quote") return { ...body, flashIntegratorFeeBps: feeBps };
  if (path === "order") return { ...body, flashIntegratorFeeBps: feeBps, ...(builderCode ? { erc8021AttributionCode: builderCode } : {}) };
  return body;
}

/**
 * Flash limits /search on low-usage keys, so search alone uses a separate key.
 * Everything that places or reads orders stays on our own key.
 */
export const keyFor = (path: string, apiKey: string, searchKey: string) => (path === "search" ? searchKey : apiKey);
