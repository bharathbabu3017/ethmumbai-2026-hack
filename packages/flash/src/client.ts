import type { components } from "./schema.gen";

type Schemas = components["schemas"];
export type QuoteRequest = Schemas["QuoteRequest"];
export type QuoteResponse = Schemas["QuoteResponse"];
export type SubmitOrderRequest = Schemas["SubmitOrderRequest"];
export type SubmitOrderResponse = Schemas["SubmitOrderResponse"];
export type UpdateOrderRequest = Schemas["UpdateOrderRequest"];
export type CancelOrderRequest = Schemas["CancelOrderRequest"];
export type BatchCancelOrderRequest = Schemas["BatchCancelOrderRequest"];
export type BatchCancelOrderResponse = Schemas["BatchCancelOrderResponse"];
export type FlashOrder = Schemas["FlashOrder"];
export type FlashFill = Schemas["FlashFill"];
export type FlashGetOrderResponse = Schemas["FlashGetOrderResponse"];
export type FlashListOrdersResponse = Schemas["FlashListOrdersResponse"];
export type FlashSearchAssetsResponse = Schemas["FlashSearchAssetsResponse"];
export type FlashBalancesResponse = Schemas["FlashBalancesResponse"];
export type Chain = Schemas["Chain"];

export const FLASH_BASE_URL = "https://flash.definitive.fi/v1";
export const PUBLIC_DEV_KEY = "dpka_513a2bd7_57a2_46d2_927b_2a3857fe271b";

// Flash allows 5 requests per second on each endpoint, per key.
const MIN_GAP_MS = 210;
const MAX_RATE_LIMIT_RETRIES = 3;

export class FlashError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(`${status} ${code}: ${message}`);
    this.name = "FlashError";
  }
}

export interface FlashClientOptions {
  apiKey: string;
  baseUrl?: string;
}

export function createFlashClient({ apiKey, baseUrl = FLASH_BASE_URL }: FlashClientOptions) {
  const nextSlot = new Map<string, number>();

  async function waitForSlot(bucket: string) {
    const now = Date.now();
    const slot = Math.max(now, nextSlot.get(bucket) ?? 0);
    nextSlot.set(bucket, slot + MIN_GAP_MS);
    if (slot > now) await new Promise((r) => setTimeout(r, slot - now));
  }

  async function request<T>(bucket: string, method: string, path: string, body?: unknown): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      await waitForSlot(bucket);
      const res = await fetch(`${baseUrl}${path}`, {
        method,
        headers: { "content-type": "application/json", "x-definitive-api-key": apiKey },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      // A 429 was never processed, so it is the only failure safe to retry on order endpoints.
      if (res.status === 429 && attempt < MAX_RATE_LIMIT_RETRIES) {
        const reset = Number(res.headers.get("RateLimit-Reset") ?? 1);
        await new Promise((r) => setTimeout(r, Math.max(reset, 1) * 1000));
        continue;
      }
      const text = await res.text();
      const json = text ? JSON.parse(text) : undefined;
      if (!res.ok) {
        const e = json?.error;
        throw new FlashError(res.status, e?.code ?? "UNKNOWN", e?.message ?? text, e?.details);
      }
      return json as T;
    }
  }

  return {
    quote: (body: QuoteRequest) => request<QuoteResponse>("quote", "POST", "/quote", body),
    submitOrder: (body: SubmitOrderRequest) => request<SubmitOrderResponse>("order", "POST", "/order", body),
    submitSetupTx: (signedSetupTx: string) =>
      request<{ status: "confirmed" | "pending" }>("setup", "POST", "/setup-transaction", { signedSetupTx }),
    listOrders: (q: { funderAddress?: string; statuses?: string[]; pageSize?: number; pageToken?: string } = {}) => {
      const p = new URLSearchParams();
      if (q.funderAddress) p.set("funderAddress", q.funderAddress);
      if (q.statuses?.length) p.set("statuses", q.statuses.join(","));
      if (q.pageSize) p.set("pageSize", String(q.pageSize));
      if (q.pageToken) p.set("pageToken", q.pageToken);
      return request<FlashListOrdersResponse>("list", "GET", `/orders?${p}`);
    },
    getOrder: (orderId: string, funderAddress: string) =>
      request<FlashGetOrderResponse>("get", "GET", `/orders/${orderId}?funderAddress=${encodeURIComponent(funderAddress)}`),
    updateOrder: (orderId: string, body: UpdateOrderRequest) =>
      request<{ ok: true }>("update", "PATCH", `/orders/${orderId}`, body),
    cancelOrder: (orderId: string, body: CancelOrderRequest) =>
      request<{ ok: true }>("cancel", "POST", `/orders/${orderId}/cancel`, body),
    cancelOrders: (body: BatchCancelOrderRequest) =>
      request<BatchCancelOrderResponse>("batchCancel", "POST", "/orders/cancel", body),
    search: (query: string, opts: { chain?: Chain; limit?: number } = {}) => {
      const p = new URLSearchParams({ query });
      if (opts.chain) p.set("chain", opts.chain);
      if (opts.limit) p.set("limit", String(opts.limit));
      return request<FlashSearchAssetsResponse>("search", "GET", `/search?${p}`);
    },
    balances: (address: string) => request<FlashBalancesResponse>("balances", "GET", `/balances/${address}`),
  };
}

export type FlashClient = ReturnType<typeof createFlashClient>;
