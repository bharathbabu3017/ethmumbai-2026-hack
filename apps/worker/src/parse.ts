const AMOUNT = /^\d+(\.\d+)?$/;
const isAmount = (s: string | undefined): s is string => !!s && AMOUNT.test(s) && Number(s) > 0;

export function parseBuy(text: string) {
  const [token, usdc] = text.trim().split(/\s+/);
  return token && isAmount(usdc) ? { token, usdc } : null;
}

export function parseLimit(text: string) {
  const [token, usdc, price] = text.trim().split(/\s+/);
  return token && isAmount(usdc) && isAmount(price) ? { token, usdc, price } : null;
}

export function parseSell(text: string) {
  const [token, amount] = text.trim().split(/\s+/);
  if (!token || !amount) return null;
  if (amount.endsWith("%")) {
    const percent = amount.slice(0, -1);
    return isAmount(percent) && Number(percent) <= 100 ? { token, percent: Number(percent) } : null;
  }
  return isAmount(amount) ? { token, qty: amount } : null;
}

/** Works out how much to sell, rounding down. Returns null if it is more than the balance. */
export function sellQty(balance: string, sell: { percent: number } | { qty: string }) {
  if ("qty" in sell) return Number(sell.qty) <= Number(balance) ? sell.qty : null;
  if (sell.percent === 100) return balance;
  const qty = Math.floor(Number(balance) * sell.percent * 1e4) / 1e6;
  return qty > 0 ? String(qty) : null;
}
