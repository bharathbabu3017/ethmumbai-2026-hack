import { TIMEFRAMES, toCandles, type Candle, type Timeframe } from "./chart";

const GECKO = "https://api.geckoterminal.com/api/v2/networks/base";
const DEXSCREENER = "https://api.dexscreener.com/token-pairs/v1/base";
const FRESH_MS = 60_000;
const POOL_MS = 24 * 3600_000;
const COOLDOWN_MS = 20_000; // the free GeckoTerminal tier allows about 30 calls a minute
const MAX_ENTRIES = 1000;

export class ChartBusy extends Error {}
export class NoMarketData extends Error {}

interface Pair {
  pairAddress: string;
  liquidity?: { usd?: number };
}

function keep<V>(map: Map<string, V>, key: string, value: V) {
  if (map.size >= MAX_ENTRIES) map.delete(map.keys().next().value!);
  map.set(key, value);
}

export function createChartData(fetcher: typeof fetch = fetch, now = () => Date.now()) {
  const pools = new Map<string, { pool: string; at: number }>();
  const candles = new Map<string, { candles: Candle[]; at: number }>();
  const pending = new Map<string, Promise<Candle[]>>();
  let coolingUntil = 0;

  const gecko = async (path: string) => {
    if (now() < coolingUntil) throw new ChartBusy();
    const res = await fetcher(`${GECKO}/${path}`, { headers: { accept: "application/json" } });
    if (res.status === 429) {
      coolingUntil = now() + COOLDOWN_MS;
      throw new ChartBusy();
    }
    return res;
  };

  /** The most liquid pool, from DexScreener so GeckoTerminal's small allowance goes on candles. */
  async function findPool(token: string) {
    const cached = pools.get(token);
    if (cached && now() - cached.at < POOL_MS) return cached.pool;

    let pool: string | undefined;
    const res = await fetcher(`${DEXSCREENER}/${token}`).catch(() => undefined);
    if (res?.ok) {
      const pairs = (await res.json()) as Pair[];
      if (!pairs.length) throw new NoMarketData();
      // Uniswap v4 pool ids are longer, and GeckoTerminal doesn't always accept them.
      pool = pairs.filter((p) => p.pairAddress.length === 42).sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0]?.pairAddress;
    }
    if (!pool) {
      const fallback = await gecko(`tokens/${token}/pools?page=1`);
      if (fallback.ok) pool = (await fallback.json()).data?.[0]?.attributes?.address;
      else if (fallback.status !== 404) throw new ChartBusy();
    }
    if (!pool) throw new NoMarketData();
    keep(pools, token, { pool, at: now() });
    return pool;
  }

  async function load(token: string, timeframe: Timeframe) {
    const pool = await findPool(token);
    const { unit, aggregate } = TIMEFRAMES[timeframe];
    const res = await gecko(`pools/${pool}/ohlcv/${unit}?aggregate=${aggregate}&limit=200&currency=usd&token=${token}`);
    if (res.status === 404) throw new NoMarketData();
    if (!res.ok) throw new ChartBusy();
    const rows = toCandles((await res.json()).data?.attributes?.ohlcv_list ?? []);
    if (!rows.length) throw new NoMarketData();
    return rows;
  }

  /** Fresh candles if possible. When rate limited, the last known candles are better than nothing. */
  return async function getCandles(rawToken: string, timeframe: Timeframe) {
    const token = rawToken.toLowerCase();
    const key = `${token}:${timeframe}`;
    const cached = candles.get(key);
    if (cached && now() - cached.at < FRESH_MS) return cached.candles;

    let request = pending.get(key);
    if (!request) {
      request = load(token, timeframe).finally(() => pending.delete(key));
      pending.set(key, request);
    }
    try {
      const rows = await request;
      keep(candles, key, { candles: rows, at: now() });
      return rows;
    } catch (e) {
      if (e instanceof ChartBusy && cached) return cached.candles;
      throw e;
    }
  };
}

const shared = globalThis as unknown as { chartData?: ReturnType<typeof createChartData> };
export const getCandles = (shared.chartData ??= createChartData());
