import { planError, planLimitsError, type AgentPlan, type PlanExit } from "./agent-plan";

export const AGENT_STRATEGIES = {
  dip: { label: "Dip buyer", about: "Buys below the price, with protection.", orders: "Limit + stop and target" },
  trend: { label: "Trend follower", about: "Buys breakouts and lets winners run.", orders: "Stop buy + trailing stop" },
  stack: { label: "Accumulator", about: "Buys steadily over time.", orders: "TWAP with a limit price" },
  custom: { label: "Custom", about: "Follows a strategy its creator wrote.", orders: "Set by its plan" },
} as const;

export type AgentStrategy = keyof typeof AGENT_STRATEGIES;
export type TemplateStrategy = Exclude<AgentStrategy, "custom">;

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
  /** A custom agent's rules, fixed when it's created. */
  plan?: AgentPlan;
  /** Hides the written strategy from its public profile. Trades and decisions stay public. */
  hideStrategy?: boolean;
}

/** Trend templates ask for a trail, which is placed once the buy fills. */
const TEMPLATE_TRAIL_PERCENT = 5;

export const agentExit = (s: AgentSettings): PlanExit | undefined => s.plan?.exit ?? (s.strategy === "trend" ? { trailPercent: TEMPLATE_TRAIL_PERCENT } : undefined);

const MIN_TRADE_USD = 1;
const MAX_STYLE = 800;
const MAX_TOKENS = 10;

/** Only a running agent that isn't private is listed publicly. Its profile link works either way. */
export const agentListed = (a: { status: string; settings: unknown }) => a.status === "running" && !(a.settings as AgentSettings).hideStrategy;

/** Why these tokens can't come off its list. It only manages exits on listed tokens, so nothing it holds or has open may be dropped. */
export function removedTokensError(removed: string[], balances: { address: string; symbol: string; notional: string }[], openOrderTokens: string[]) {
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  for (const token of removed) {
    const held = balances.find((b) => same(b.address, token) && Number(b.notional) >= MIN_MANAGED_USD);
    if (held) return `It still holds ${held.symbol}. Keep it on the list until that's sold or withdrawn.`;
    if (openOrderTokens.some((t) => same(t, token))) return "It has open orders on a token you removed. Keep it on the list until they finish.";
  }
  return null;
}

/** Dust is fine to leave behind: stopping keeps a little ETH back to pay for the transfer. */
const MAX_LEFT_ON_REMOVE_USD = 0.25;
const MIN_MANAGED_USD = 0.25;

/** Why an agent can't be removed yet. Removing hides it, so it must never hide money. */
export function removalError(status: string, walletUsd: number, openOrders: number) {
  if (status !== "stopped" && status !== "funding") return "Stop it first.";
  if (openOrders > 0) return "It still has open orders. Stop it first.";
  if (walletUsd > MAX_LEFT_ON_REMOVE_USD) return `Its wallet still holds $${walletUsd.toFixed(2)}. Withdraw that first.`;
  return null;
}

/** A plain-English reason these settings can't be used, or null if they can. */
export function agentSettingsError(s: AgentSettings) {
  if (!(s.strategy in AGENT_STRATEGIES)) return "Pick a strategy.";
  if (!s.tokens.length) return "Pick at least one token.";
  if (s.tokens.length > MAX_TOKENS) return `Pick at most ${MAX_TOKENS} tokens.`;
  if (s.tokens.some((t) => !/^0x[0-9a-fA-F]{40}$/.test(t))) return "One of the tokens isn't a valid address.";
  if (!(s.maxTradeUsd >= MIN_TRADE_USD)) return `Max per trade must be at least $${MIN_TRADE_USD}.`;
  if (!(s.budgetUsd >= s.maxTradeUsd)) return "The budget must be at least the max per trade.";
  if (!AGENT_CHECK_MINUTES.includes(s.everyMinutes as never)) return "Pick how often it checks the market.";
  if (s.style.length > MAX_STYLE) return `Keep it under ${MAX_STYLE} characters.`;
  if (s.strategy === "custom") {
    if (!s.plan) return "Turn your strategy into a plan first.";
    return planError(s.plan) ?? planLimitsError(s.plan, s);
  }
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
