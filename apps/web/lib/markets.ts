import { BASE_TOKENS, createFlashClient, PUBLIC_DEV_KEY } from "@flashmob/flash";

export interface Market {
  symbol: string;
  address: string;
  price: number;
  change24h: number;
}

const FRESH_MS = 60_000;
const shared = globalThis as unknown as { markets?: { at: number; rows: Market[] }; marketsLoading?: Promise<Market[]> };

async function load() {
  const flash = createFlashClient({ apiKey: process.env.FLASH_SEARCH_KEY || PUBLIC_DEV_KEY });
  const rows: Market[] = [];
  for (const token of BASE_TOKENS) {
    const { assets } = await flash.search(token.address, { chain: "base", limit: 1 });
    const asset = assets[0];
    if (asset && Number(asset.price) > 0) rows.push({ symbol: token.symbol, address: token.address, price: Number(asset.price), change24h: Number(asset.priceChange24h) * 100 });
    await new Promise((r) => setTimeout(r, 550)); // this key allows 2 searches a second
  }
  shared.markets = { at: Date.now(), rows };
  return rows;
}

/** Real prices for the listed tokens, cached so every visitor shares one set of calls. */
export async function getMarkets() {
  if (shared.markets && Date.now() - shared.markets.at < FRESH_MS) return shared.markets.rows;
  shared.marketsLoading ??= load().finally(() => (shared.marketsLoading = undefined));
  return shared.marketsLoading.catch(() => shared.markets?.rows ?? []);
}
