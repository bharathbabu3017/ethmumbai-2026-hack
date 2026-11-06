export { isTimeframe, TIMEFRAMES, toCandles, type Candle, type Timeframe } from "@flashmob/flash";

/** Enough decimals to show a price sensibly, from BTC down to low-priced tokens. */
export function pricePrecision(price: number) {
  if (price >= 100) return 2;
  if (price >= 1) return 3;
  return Math.min(10, Math.ceil(-Math.log10(price)) + 3);
}
