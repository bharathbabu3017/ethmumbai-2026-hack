import { FlashError, type FlashClient } from "./client";

export interface Token {
  symbol: string;
  address: string;
  riskFlagged: boolean;
}

// Flash's /search is limited for low-usage keys, so common Base tokens are listed here.
export const BASE_TOKENS: Token[] = [
  { symbol: "WETH", address: "0x4200000000000000000000000000000000000006", riskFlagged: false },
  { symbol: "cbBTC", address: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf", riskFlagged: false },
  { symbol: "AERO", address: "0x940181a94A35A4569E4529A3CDfB74e38FD98631", riskFlagged: false },
  { symbol: "VIRTUAL", address: "0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b", riskFlagged: false },
  { symbol: "DEGEN", address: "0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed", riskFlagged: false },
  { symbol: "BRETT", address: "0x532f27101965dd16442E59d40670FaF5eBB142E4", riskFlagged: false },
];

export const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

/** Picks an exact match, preferring tokens that aren't flagged and have the deepest liquidity, so a copycat can't win on name alone. */
function bestMatch<T extends { symbol: string; address: string; riskFlagged: boolean; liquidity: string }>(assets: T[], q: string) {
  return assets
    .filter((a) => a.symbol.toLowerCase() === q || a.address.toLowerCase() === q)
    .sort((a, b) => Number(a.riskFlagged) - Number(b.riskFlagged) || Number(b.liquidity) - Number(a.liquidity))[0];
}

/** Finds a Base token by symbol or address. A pasted address that search can't confirm is marked as unverified. */
export async function resolveBaseToken(flash: FlashClient, query: string): Promise<Token | undefined> {
  const q = query.trim().toLowerCase();
  const listed = BASE_TOKENS.find((t) => t.symbol.toLowerCase() === q || t.address.toLowerCase() === q);
  if (listed) return listed;
  try {
    const { assets } = await flash.search(query.trim(), { chain: "base", limit: 10 });
    const found = bestMatch(assets, q);
    if (found) return { symbol: found.symbol, address: found.address, riskFlagged: found.riskFlagged };
  } catch (e) {
    if (!(e instanceof FlashError && e.status === 403)) throw e;
  }
  if (/^0x[0-9a-f]{40}$/.test(q)) return { symbol: `${query.trim().slice(0, 6)}…`, address: query.trim(), riskFlagged: true };
  return undefined;
}
