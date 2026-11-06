import { feeFields } from "@flashmob/flash";

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
  if (path !== "quote" && path !== "order") return body;
  const { flashIntegratorFeeBps: _ignored, erc8021AttributionCode: _alsoIgnored, ...clean } = body;
  return { ...clean, ...feeFields(feeBps), ...(path === "order" && builderCode ? { erc8021AttributionCode: builderCode } : {}) };
}
