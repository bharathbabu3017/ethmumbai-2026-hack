export const AGENT_STRATEGIES = {
  dip: { label: "Dip buyer", about: "Buys below the price, with protection.", orders: "Limit + stop and target" },
  trend: { label: "Trend follower", about: "Buys breakouts and lets winners run.", orders: "Stop buy + trailing stop" },
  stack: { label: "Accumulator", about: "Buys steadily over time.", orders: "TWAP with a limit price" },
} as const;

export type AgentStrategy = keyof typeof AGENT_STRATEGIES;

export const AGENT_CHECK_MINUTES = [15, 60, 240] as const;
export const MAX_AGENTS_PER_USER = 3;

export interface AgentSettings {
  strategy: AgentStrategy;
  /** The creator's own guidance, in plain words. */
  style: string;
  /** Token addresses on Base it may trade. */
  tokens: string[];
  budgetUsd: number;
  maxTradeUsd: number;
  everyMinutes: number;
}

const MIN_TRADE_USD = 1;
const MAX_STYLE = 500;
const MAX_TOKENS = 10;

/** A plain-English reason these settings can't be used, or null if they can. */
export function agentSettingsError(s: AgentSettings) {
  if (!(s.strategy in AGENT_STRATEGIES)) return "Pick a strategy.";
  if (!s.tokens.length) return "Pick at least one token.";
  if (s.tokens.length > MAX_TOKENS) return `Pick at most ${MAX_TOKENS} tokens.`;
  if (s.tokens.some((t) => !/^0x[0-9a-fA-F]{40}$/.test(t))) return "One of the tokens isn't a valid address.";
  if (!(s.maxTradeUsd >= MIN_TRADE_USD)) return `Max per trade must be at least $${MIN_TRADE_USD}.`;
  if (!(s.budgetUsd >= s.maxTradeUsd)) return "The budget must be at least the max per trade.";
  if (!AGENT_CHECK_MINUTES.includes(s.everyMinutes as never)) return "Pick how often it checks the market.";
  if (s.style.length > MAX_STYLE) return `Keep its style under ${MAX_STYLE} characters.`;
  return null;
}

/** Stands for the chain's own coin, which has no token address. */
export const NATIVE_ASSET = "eth";
/** "all" takes everything, less the gas reserve for ETH. */
export const WITHDRAW_ALL = "all";
/** Left in an agent's wallet so it can still pay for its next transfer. */
export const AGENT_GAS_RESERVE_ETH = "0.00002";

/** A plain-English reason this withdrawal can't be asked for, or null if it can. */
export function withdrawalError({ token, amount }: { token: unknown; amount: unknown }) {
  if (typeof token !== "string" || (token !== NATIVE_ASSET && !/^0x[0-9a-fA-F]{40}$/.test(token))) return "Pick what to withdraw.";
  if (amount === WITHDRAW_ALL) return null;
  if (typeof amount !== "string" || !/^\d+(\.\d+)?$/.test(amount) || !(Number(amount) > 0)) return "Enter an amount.";
  return null;
}
