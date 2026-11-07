import type { AgentSettings } from "./agents";
import type { AgentToken } from "./agent-decision";
import type { TradeForm } from "./build";
import { TIMEFRAMES, type Timeframe } from "./candles";
import type { Indicators } from "./indicators";

export const PLAN_METRICS = {
  rsi: { label: "RSI", unit: "", timed: true },
  vsSma20: { label: "Price vs 20-candle average", unit: "%", timed: true },
  vsSma50: { label: "Price vs 50-candle average", unit: "%", timed: true },
  fromHigh7d: { label: "Price vs 7-day high", unit: "%", timed: false },
  fromLow7d: { label: "Price vs 7-day low", unit: "%", timed: false },
  volumeRatio: { label: "Volume vs normal", unit: "x", timed: false },
  volatility: { label: "Volatility", unit: "%", timed: true },
  change24h: { label: "Change, 24 hours", unit: "%", timed: false },
  liquidity: { label: "Liquidity", unit: "$", timed: false },
  mobBuyers: { label: "Flashmob traders buying, last hour", unit: "", timed: false },
} as const;

export type PlanMetric = keyof typeof PLAN_METRICS;

export interface PlanRule {
  metric: PlanMetric;
  timeframe?: Timeframe;
  op: "above" | "below";
  value: number;
}

export const ENTRY_TYPES = ["market", "limit", "ladder", "breakout", "pullback", "bounce", "twap"] as const;
export type EntryType = (typeof ENTRY_TYPES)[number];

export interface PlanEntry {
  type: EntryType;
  /** Limit and pullback: how far below the price. Breakout: how far above it, or the 7-day high if unset. TWAP: the most it pays above the price. */
  offsetPercent?: number;
  /** Breakout and pullback: the most it pays above the trigger once it fires. Unset buys at market. */
  capPercent?: number;
  /** Bounce: how far the price must rise off its low before it buys. */
  trailPercent?: number;
  /** Bounce: buy with a limit at the trail instead of at market, so it can miss. */
  limitOnly?: boolean;
  rungs?: number;
  stepPercent?: number;
  durationMinutes?: number;
  /** Lets it buy the same token again after this long. Without it, one position at a time. */
  repeatHours?: number;
}

export interface PlanExit {
  stopPercent?: number;
  targetPercent?: number;
  trailPercent?: number;
  /** Starts trailing only once the price is this far above the entry. */
  trailArmPercent?: number;
  /** Sells with a limit at the trail instead of at market, so it can miss in a fast fall. */
  trailLimitOnly?: boolean;
}

export interface AgentPlan {
  summary: string;
  rules: PlanRule[];
  /** A condition numbers can't test, decided by the model at the moment of buying. */
  judgment?: string;
  useNews?: boolean;
  entry: PlanEntry;
  exit: PlanExit;
}

export interface PlanCheck {
  label: string;
  value: string;
  pass: boolean;
}

export interface PlanOrder {
  label: string;
  value: string;
  amountUsd: number;
  form: Omit<TradeForm, "tokenAddress" | "funder">;
}

export type IndicatorsByTimeframe = Partial<Record<Timeframe, Indicators>>;

const NO_DATA = "No data";
const MAX_RULES = 6;
const MAX_JUDGMENT = 200;
const MAX_SUMMARY = 200;
const MIN_RUNG_USD = 1;
const ENTRY_EXPIRY_DAYS = "1";
const DEFAULT_TWAP_CAP = 2;
const HOUR_LIMIT = 720;

const within = (n: unknown, low: number, high: number) => typeof n === "number" && Number.isFinite(n) && n >= low && n <= high;
const unset = (n: unknown) => n === undefined || n === null;

/** Plain decimals only, since Flash rejects exponents, and six significant digits suit any price. */
export function priceText(n: number) {
  const fixed = Number(n.toPrecision(6)).toFixed(12);
  return fixed.replace(/\.?0+$/, "");
}

/** Rounded down, so a sale never asks for more than the wallet holds. */
const qtyText = (n: number) => (Math.floor(n * 1e6) / 1e6).toFixed(6).replace(/\.?0+$/, "");

const money = (n: number) => `$${n >= 1000 ? n.toLocaleString("en-US", { maximumFractionDigits: 0 }) : Number(n.toPrecision(5))}`;

/** The timeframes a plan needs. 1 hour is always read, because weekly levels come from it. */
export const planTimeframes = (plan: AgentPlan) => [...new Set<Timeframe>(["1h", ...plan.rules.flatMap((r) => (r.timeframe ? [r.timeframe] : []))])];

/** A plain-English reason this plan can't run, or null if it can. */
export function planError(plan: AgentPlan) {
  if (!plan || typeof plan !== "object" || !plan.entry || !plan.exit || !Array.isArray(plan.rules)) return "That plan isn't complete.";
  const { rules, entry, exit } = plan;
  if (!String(plan.summary ?? "").trim() || String(plan.summary).length > MAX_SUMMARY) return "The plan needs a short summary.";
  if (rules.length > MAX_RULES) return `A plan can have at most ${MAX_RULES} rules.`;
  for (const r of rules) {
    if (!Object.hasOwn(PLAN_METRICS, r.metric)) return "A rule uses something the agent can't measure.";
    if (r.op !== "above" && r.op !== "below") return "A rule must say above or below.";
    if (!within(r.value, -1e12, 1e12)) return "A rule needs a number.";
    if (!unset(r.timeframe) && !Object.hasOwn(TIMEFRAMES, r.timeframe!)) return "A rule uses an unknown timeframe.";
  }
  if (String(plan.judgment ?? "").length > MAX_JUDGMENT) return `Keep the judgment under ${MAX_JUDGMENT} characters.`;
  if (!rules.length && !plan.judgment && unset(entry.repeatHours)) return "The plan needs at least one rule for when to buy.";

  if (entry.type === "limit" && !within(entry.offsetPercent, 0.1, 30)) return "A limit buy must sit 0.1% to 30% below the price.";
  if (entry.type === "ladder") {
    if (!Number.isInteger(entry.rungs) || !within(entry.rungs, 2, 5)) return "A ladder needs 2 to 5 orders.";
    if (!within(entry.stepPercent, 0.2, 15)) return "Ladder orders must be 0.2% to 15% apart.";
  }
  if (entry.type === "breakout" && !unset(entry.offsetPercent) && !within(entry.offsetPercent, 0.1, 30)) return "A breakout must trigger 0.1% to 30% above the price.";
  if (entry.type === "pullback" && !within(entry.offsetPercent, 0.1, 30)) return "A pullback buy must trigger 0.1% to 30% below the price.";
  if (entry.type === "bounce" && !within(entry.trailPercent, 0.5, 50)) return "A bounce buy must trail by 0.5% to 50%.";
  if (!unset(entry.capPercent) && (!["breakout", "pullback"].includes(entry.type) || !within(entry.capPercent, 0.1, 30))) return "A price cap must be 0.1% to 30% above a stop buy's trigger.";
  if (entry.type === "twap") {
    if (!within(entry.durationMinutes, 10, 43_200)) return "A TWAP must run for 10 minutes to 30 days.";
    if (!unset(entry.offsetPercent) && !within(entry.offsetPercent, 0.1, 30)) return "A TWAP's price cap must be 0.1% to 30% above the price.";
  }
  if (!ENTRY_TYPES.includes(entry.type)) return "The plan needs a way to buy.";
  if (!unset(entry.repeatHours) && !within(entry.repeatHours, 1, HOUR_LIMIT)) return "It can repeat every 1 to 720 hours.";

  if (!unset(exit.stopPercent) && !within(exit.stopPercent, 0.5, 50)) return "A stop must be 0.5% to 50% away.";
  if (!unset(exit.targetPercent) && !within(exit.targetPercent, 0.5, 500)) return "A target must be 0.5% to 500% away.";
  if (!unset(exit.trailPercent) && !within(exit.trailPercent, 0.5, 50)) return "A trail must be 0.5% to 50%.";
  if (!unset(exit.trailArmPercent) && (unset(exit.trailPercent) || !within(exit.trailArmPercent, 0.5, 500))) return "A trail can start 0.5% to 500% above the entry.";
  const hasExit = !unset(exit.stopPercent) || !unset(exit.targetPercent) || !unset(exit.trailPercent);
  if (!hasExit && unset(entry.repeatHours)) return "The plan needs a way to sell: a stop, a target or a trail.";
  return null;
}

/** Whether these limits leave each order of the plan big enough. */
export function planLimitsError(plan: AgentPlan, s: Pick<AgentSettings, "maxTradeUsd">) {
  if (plan.entry.type === "ladder" && s.maxTradeUsd / plan.entry.rungs! < MIN_RUNG_USD) return `Max per trade must be at least $${plan.entry.rungs! * MIN_RUNG_USD} for ${plan.entry.rungs} orders.`;
  return null;
}

export function ruleLabel(r: PlanRule) {
  const metric = PLAN_METRICS[r.metric];
  const value = metric.unit === "$" ? money(r.value) : `${r.value}${metric.unit}`;
  return `${metric.label}${metric.timed ? `, ${r.timeframe ?? "1h"}` : ""} ${r.op === "above" ? "at least" : "at most"} ${value}`;
}

export function entryLabel(e: PlanEntry) {
  const repeat = e.repeatHours ? `, repeating every ${e.repeatHours} hours` : "";
  if (e.type === "market") return `Market buy${repeat}`;
  if (e.type === "limit") return `Limit buy ${e.offsetPercent}% below the price${repeat}`;
  if (e.type === "ladder") return `${e.rungs} limit buys, ${e.stepPercent}% apart${repeat}`;
  const cap = e.capPercent ? `, paying at most ${e.capPercent}% above that` : "";
  if (e.type === "breakout") return `Stop buy ${e.offsetPercent ? `${e.offsetPercent}% above the price` : "at the 7-day high"}${cap}${repeat}`;
  if (e.type === "pullback") return `Stop buy ${e.offsetPercent}% below the price${cap}${repeat}`;
  if (e.type === "bounce") return `Trailing ${e.limitOnly ? "limit " : ""}buy after a ${e.trailPercent}% bounce off the low${repeat}`;
  return `TWAP buy over ${e.durationMinutes} minutes${repeat}`;
}

export function exitLabels(x: PlanExit) {
  const { stopPercent: stop, targetPercent: target, trailPercent: trail } = x;
  const trailing = `${trail}% trailing ${x.trailLimitOnly ? "stop limit" : "stop"}${x.trailArmPercent ? `, starting at +${x.trailArmPercent}%` : ""}`;
  if (stop && target && trail) return [`Half: bracket, stop at -${stop}%, target at +${target}%`, `Other half: ${trailing}`];
  if (trail) return [trailing[0]!.toUpperCase() + trailing.slice(1)];
  if (stop && target) return [`Bracket: stop at -${stop}%, target at +${target}%`];
  if (stop) return [`Stop at -${stop}%`];
  if (target) return [`Target at +${target}%`];
  return ["Holds what it buys"];
}

function reading(r: PlanRule, token: AgentToken, read: IndicatorsByTimeframe, mobBuyers: number): number | null {
  const timed = read[r.timeframe ?? "1h"];
  const hourly = read["1h"];
  const versus = (level: number | null | undefined) => (level ? ((token.price - level) / level) * 100 : null);
  switch (r.metric) {
    case "rsi": return timed?.rsi ?? null;
    case "vsSma20": return versus(timed?.sma20);
    case "vsSma50": return versus(timed?.sma50);
    case "volatility": return timed?.volatility ?? null;
    case "fromHigh7d": return versus(hourly?.high7d);
    case "fromLow7d": return versus(hourly?.low7d);
    case "volumeRatio": return hourly?.volumeRatio ?? null;
    case "change24h": return token.change24h;
    case "liquidity": return token.liquidity;
    case "mobBuyers": return mobBuyers;
  }
}

/** Tests every rule in code. A number we can't read fails its rule, so missing data never causes a buy. */
export function checkRules(plan: AgentPlan, token: AgentToken, read: IndicatorsByTimeframe, mobBuyers: number) {
  const checks: PlanCheck[] = plan.rules.map((rule) => {
    const value = reading(rule, token, read, mobBuyers);
    const { unit } = PLAN_METRICS[rule.metric];
    const shown = value === null ? NO_DATA : unit === "$" ? money(value) : `${Number(value.toFixed(unit === "x" ? 2 : 1))}${unit}`;
    return { label: `${token.symbol}: ${ruleLabel(rule)}`, value: shown, pass: value !== null && (rule.op === "above" ? value >= rule.value : value <= rule.value) };
  });
  return { checks, passed: checks.every((c) => c.pass) };
}

export const failedReason = (c: PlanCheck) => (c.value === NO_DATA ? `It couldn't read this: ${c.label}.` : `${c.label} failed: it's ${c.value}.`);

/** Turns the plan's entry into exact orders for this amount. */
export function entryOrders(plan: AgentPlan, token: AgentToken, read: IndicatorsByTimeframe, amountUsd: number): PlanOrder[] | { skip: string } {
  const { entry } = plan;
  const { price, symbol } = token;
  const below = (percent: number) => price * (1 - percent / 100);
  const cents = (n: number) => Math.floor(n * 100) / 100;

  if (entry.type === "market") return [{ label: `Market buy ${symbol}`, value: money(amountUsd), amountUsd, form: { side: "buy", type: "market", qty: String(cents(amountUsd)) } }];
  if (entry.type === "limit") {
    const limit = priceText(below(entry.offsetPercent!));
    return [{ label: `Limit buy ${symbol} ${money(amountUsd)}`, value: money(Number(limit)), amountUsd, form: { side: "buy", type: "limit", qty: String(cents(amountUsd)), price: limit, expiryDays: ENTRY_EXPIRY_DAYS } }];
  }
  if (entry.type === "ladder") {
    const rungs = entry.rungs!;
    const each = cents(amountUsd / rungs);
    if (each < MIN_RUNG_USD) return { skip: `${money(amountUsd)} is too little for ${rungs} orders.` };
    return Array.from({ length: rungs }, (_, i) => {
      const limit = priceText(below(entry.stepPercent! * (i + 1)));
      return { label: `Limit buy ${symbol} ${money(each)}`, value: money(Number(limit)), amountUsd: each, form: { side: "buy" as const, type: "limit" as const, qty: String(each), price: limit, expiryDays: ENTRY_EXPIRY_DAYS } };
    });
  }
  const capped = (trigger: number) => (entry.capPercent ? { price: priceText(trigger * (1 + entry.capPercent / 100)) } : {});
  if (entry.type === "pullback") {
    const trigger = below(entry.offsetPercent!);
    return [{ label: `Stop buy ${symbol} ${money(amountUsd)}`, value: money(trigger), amountUsd, form: { side: "buy", type: "stop", qty: String(cents(amountUsd)), trigger: priceText(trigger), triggerDirection: "lower", expiryDays: ENTRY_EXPIRY_DAYS, ...capped(trigger) } }];
  }
  if (entry.type === "bounce") {
    return [{ label: `Trailing buy ${symbol} ${money(amountUsd)}`, value: `${entry.trailPercent}%`, amountUsd, form: { side: "buy", type: entry.limitOnly ? "trailing-stop-limit" : "trailing-stop", qty: String(cents(amountUsd)), trailPercent: String(entry.trailPercent), expiryDays: ENTRY_EXPIRY_DAYS } }];
  }
  if (entry.type === "breakout") {
    const high = read["1h"]?.high7d;
    const level = entry.offsetPercent ? price * (1 + entry.offsetPercent / 100) : high;
    if (!level) return { skip: `It couldn't read the 7-day high of ${symbol}.` };
    if (level <= price) return { skip: `${symbol} is already above its breakout level.` };
    const trigger = priceText(level);
    return [{ label: `Stop buy ${symbol} ${money(amountUsd)}`, value: money(Number(trigger)), amountUsd, form: { side: "buy", type: "stop", qty: String(cents(amountUsd)), trigger, triggerDirection: "upper", expiryDays: ENTRY_EXPIRY_DAYS, ...capped(level) } }];
  }
  const cap = priceText(price * (1 + (entry.offsetPercent ?? DEFAULT_TWAP_CAP) / 100));
  return [{ label: `TWAP buy ${symbol} ${money(amountUsd)}`, value: `${entry.durationMinutes} min, up to ${money(Number(cap))}`, amountUsd, form: { side: "buy", type: "twap", qty: String(cents(amountUsd)), durationMinutes: String(entry.durationMinutes), price: cap } }];
}

/** The sell orders protecting a position. They're levels from the entry, unless the price has already passed them. */
export function exitOrders(x: PlanExit, symbol: string, qty: number, price: number, entryPrice: number | null): PlanOrder[] {
  const { stopPercent: stop, targetPercent: target, trailPercent: trail } = x;
  const from = (base: number) => ({ stop: stop ? base * (1 - stop / 100) : 0, target: target ? base * (1 + target / 100) : 0 });
  const fromEntry = from(entryPrice ?? price);
  const levels = (stop && fromEntry.stop >= price) || (target && fromEntry.target <= price) ? from(price) : fromEntry;
  const arm = x.trailArmPercent ? { activationPrice: priceText((entryPrice ?? price) * (1 + x.trailArmPercent / 100)) } : {};
  const trailing = (amount: number): PlanOrder => ({ label: `Trailing stop on ${symbol}`, value: `${trail}%`, amountUsd: 0, form: { side: "sell", type: x.trailLimitOnly ? "trailing-stop-limit" : "trailing-stop", qty: qtyText(amount), trailPercent: String(trail), ...arm } });
  const bracket = (amount: number): PlanOrder => ({ label: `Stop and target on ${symbol}`, value: `${money(levels.stop)} / ${money(levels.target)}`, amountUsd: 0, form: { side: "sell", type: "bracket", qty: qtyText(amount), bracketStop: priceText(levels.stop), bracketTarget: priceText(levels.target) } });

  if (stop && target && trail) return [bracket(qty / 2), trailing(qty / 2)];
  if (trail) return [trailing(qty)];
  if (stop && target) return [bracket(qty)];
  if (stop) return [{ label: `Stop on ${symbol}`, value: money(levels.stop), amountUsd: 0, form: { side: "sell", type: "stop-loss", qty: qtyText(qty), trigger: priceText(levels.stop) } }];
  if (target) return [{ label: `Target on ${symbol}`, value: money(levels.target), amountUsd: 0, form: { side: "sell", type: "take-profit", qty: qtyText(qty), trigger: priceText(levels.target) } }];
  return [];
}

export const hasExit = (x?: PlanExit) => !!(x?.stopPercent || x?.targetPercent || x?.trailPercent);
