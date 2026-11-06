import type { Candle, Timeframe } from "./candles";

const RSI_PERIOD = 14;
const ATR_PERIOD = 14;
const WEEK_SECONDS = 7 * 86_400;
const DAY_SECONDS = 86_400;

export interface Indicators {
  rsi: number | null;
  sma20: number | null;
  sma50: number | null;
  high7d: number | null;
  low7d: number | null;
  /** The last day's volume against the average day before it. */
  volumeRatio: number | null;
  /** Average candle range as a percentage of price. */
  volatility: number | null;
}

/** Wilder's RSI, from oldest to newest closes. */
export function rsi(closes: number[], period = RSI_PERIOD) {
  if (closes.length <= period) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const move = closes[i]! - closes[i - 1]!;
    if (move > 0) gain += move;
    else loss -= move;
  }
  gain /= period;
  loss /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const move = closes[i]! - closes[i - 1]!;
    gain = (gain * (period - 1) + Math.max(move, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-move, 0)) / period;
  }
  if (loss === 0) return gain === 0 ? 50 : 100;
  return 100 - 100 / (1 + gain / loss);
}

export function sma(closes: number[], period: number) {
  if (closes.length < period) return null;
  return closes.slice(-period).reduce((sum, c) => sum + c, 0) / period;
}

function volatility(candles: Candle[]) {
  if (candles.length <= ATR_PERIOD) return null;
  const recent = candles.slice(-ATR_PERIOD - 1);
  let total = 0;
  for (let i = 1; i < recent.length; i++) {
    const { high, low } = recent[i]!;
    const previous = recent[i - 1]!.close;
    total += Math.max(high - low, Math.abs(high - previous), Math.abs(low - previous));
  }
  return (total / ATR_PERIOD / recent.at(-1)!.close) * 100;
}

function volumeRatio(candles: Candle[], end: number) {
  const lastDay = candles.filter((c) => c.time > end - DAY_SECONDS);
  const before = candles.filter((c) => c.time <= end - DAY_SECONDS);
  const days = before.length ? (end - DAY_SECONDS - before[0]!.time) / DAY_SECONDS : 0;
  if (days < 1 || !lastDay.every((c) => c.volume !== undefined)) return null;
  const average = before.reduce((sum, c) => sum + (c.volume ?? 0), 0) / days;
  return average > 0 ? lastDay.reduce((sum, c) => sum + (c.volume ?? 0), 0) / average : null;
}

/** Everything a plan can test, from candles oldest to newest. Anything without enough history is null, and fails its rule. */
export function indicators(candles: Candle[]): Indicators {
  const closes = candles.map((c) => c.close);
  const end = candles.at(-1)?.time ?? 0;
  const week = candles.filter((c) => c.time > end - WEEK_SECONDS);
  const fullWeek = !!candles.length && end - candles[0]!.time >= WEEK_SECONDS - DAY_SECONDS;
  return {
    rsi: rsi(closes),
    sma20: sma(closes, 20),
    sma50: sma(closes, 50),
    high7d: fullWeek ? Math.max(...week.map((c) => c.high)) : null,
    low7d: fullWeek ? Math.min(...week.map((c) => c.low)) : null,
    volumeRatio: volumeRatio(candles, end),
    volatility: volatility(candles),
  };
}

/** Reads each timeframe once. A timeframe that can't be read is left out, so rules on it fail safely. */
export async function readIndicators(getCandles: (token: string, timeframe: Timeframe) => Promise<Candle[]>, token: string, timeframes: Timeframe[]) {
  const read: Partial<Record<Timeframe, Indicators>> = {};
  for (const timeframe of timeframes) {
    const candles = await getCandles(token, timeframe).catch(() => undefined);
    if (candles) read[timeframe] = indicators(candles);
  }
  return read;
}
