export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export const TIMEFRAMES = {
  "15m": { unit: "minute", aggregate: 15 },
  "1h": { unit: "hour", aggregate: 1 },
  "1d": { unit: "day", aggregate: 1 },
} as const;

export type Timeframe = keyof typeof TIMEFRAMES;

export const isTimeframe = (v: string | null): v is Timeframe => v !== null && Object.hasOwn(TIMEFRAMES, v);

/** GeckoTerminal returns newest first, but the chart needs oldest first with one candle per time. */
export function toCandles(rows: number[][]): Candle[] {
  const byTime = new Map<number, Candle>();
  for (const [time, open, high, low, close] of rows) {
    if ([time, open, high, low, close].every((n) => Number.isFinite(n))) byTime.set(time!, { time: time!, open: open!, high: high!, low: low!, close: close! });
  }
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

/** Enough decimals to show a price sensibly, from BTC down to low-priced tokens. */
export function pricePrecision(price: number) {
  if (price >= 100) return 2;
  if (price >= 1) return 3;
  return Math.min(10, Math.ceil(-Math.log10(price)) + 3);
}
