const DEXSCREENER = "https://api.dexscreener.com/token-pairs/v1/base";
const FRESH_MS = 30_000;

export interface TokenStats {
  price: number;
  change24h: number | null;
  volume24h: number | null;
  liquidity: number | null;
}

interface Pair {
  priceUsd?: string;
  priceChange?: { h24?: number };
  volume?: { h24?: number };
  liquidity?: { usd?: number };
}

const shared = globalThis as unknown as { tokenStats?: Map<string, { at: number; stats: TokenStats | null }> };

/** Live stats from the token's most liquid pool, cached so every visitor shares one call. */
export async function getTokenStats(address: string) {
  const cache = (shared.tokenStats ??= new Map());
  const key = address.toLowerCase();
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < FRESH_MS) return cached.stats;

  const res = await fetch(`${DEXSCREENER}/${address}`).catch(() => undefined);
  if (!res?.ok) return cached?.stats ?? null;
  const pairs = (await res.json()) as Pair[];
  const pair = pairs.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
  const stats: TokenStats | null = pair?.priceUsd
    ? { price: Number(pair.priceUsd), change24h: pair.priceChange?.h24 ?? null, volume24h: pair.volume?.h24 ?? null, liquidity: pair.liquidity?.usd ?? null }
    : null;
  cache.set(key, { at: Date.now(), stats });
  return stats;
}
