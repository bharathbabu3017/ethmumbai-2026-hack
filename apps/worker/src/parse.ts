const AMOUNT = /^\d*\.?\d+$/;
const isAmount = (s: string | undefined): s is string => !!s && AMOUNT.test(s) && Number(s) > 0;
const words = (text: string) => text.trim().split(/\s+/).filter(Boolean);

export type SellAmount = { percent: number } | { qty: string };

export function parseSellAmount(amount: string | undefined): SellAmount | null {
  if (!amount) return null;
  if (amount.endsWith("%")) {
    const percent = amount.slice(0, -1);
    return isAmount(percent) && Number(percent) <= 100 ? { percent: Number(percent) } : null;
  }
  return isAmount(amount) ? { qty: amount } : null;
}

/** Reads an optional "stop 1900 target 2500" from the end of a command. */
function parseExits(rest: string[]) {
  if (!rest.length) return {};
  const [a, stop, b, target] = rest;
  return rest.length === 4 && a === "stop" && b === "target" && isAmount(stop) && isAmount(target) ? { stop, target } : null;
}

export function parseBuy(text: string) {
  const [token, usdc, ...rest] = words(text);
  const exits = parseExits(rest);
  return token && isAmount(usdc) && exits ? { token, usdc, ...exits } : null;
}

export function parseLimit(text: string) {
  const [token, usdc, price, ...rest] = words(text);
  const exits = parseExits(rest);
  return token && isAmount(usdc) && isAmount(price) && exits ? { token, usdc, price, ...exits } : null;
}

export function parseSell(text: string) {
  const [token, amount] = words(text);
  const sell = parseSellAmount(amount);
  return token && sell ? { token, ...sell } : null;
}

/** /limitsell, /stoploss and /takeprofit: a token, how much, and one price. */
export function parseSellAt(text: string) {
  const [token, amount, price, ...rest] = words(text);
  const sell = parseSellAmount(amount);
  return token && sell && isAmount(price) && !rest.length ? { token, sell, price } : null;
}

export function parseStopBuy(text: string) {
  const [token, usdc, trigger, direction, ...rest] = words(text);
  if (!token || !isAmount(usdc) || !isAmount(trigger) || rest.length) return null;
  if (direction && direction !== "dip") return null;
  return { token, usdc, trigger, direction: direction ? ("lower" as const) : ("upper" as const) };
}

export function parseBracket(text: string) {
  const [token, amount, stop, target, ...rest] = words(text);
  const sell = parseSellAmount(amount);
  return token && sell && isAmount(stop) && isAmount(target) && Number(target) > Number(stop) && !rest.length ? { token, sell, stop, target } : null;
}

/** /twap and /trail: buy or sell, a token, how much, and one setting. */
export function parseTimed(text: string) {
  const [side, token, amount, value, ...rest] = words(text);
  if ((side !== "buy" && side !== "sell") || !token || !isAmount(value) || rest.length) return null;
  const sell = side === "sell" ? parseSellAmount(amount) : null;
  if (side === "sell") return sell ? { side, token, sell, value } : null;
  return isAmount(amount) ? { side, token, usdc: amount, value } : null;
}

/** Works out how much to sell, rounding down. Returns null if it is more than the balance. */
export function sellQty(balance: string, sell: SellAmount) {
  if ("qty" in sell) return Number(sell.qty) <= Number(balance) ? sell.qty : null;
  if (sell.percent === 100) return balance;
  const qty = Math.floor(Number(balance) * sell.percent * 1e4) / 1e6;
  return qty > 0 ? String(qty) : null;
}
