import { activeAgents, agentSpentUsd, claimAgentCheck, enqueueJob, getPosition, lastDecisionAt, recentBuyers, recordDecision, setAgentStatus, type Db } from "@flashmob/db";
import { agentExit, buildOrder, checkDecision, checkRules, cleanReason, entryOrders, exitOrders, failedReason, hasExit, OPEN_STATUSES, planTimeframes, USDC_BASE, type AgentContext, type AgentDecision, type AgentPlan, type AgentSettings, type AgentToken, type FlashClient, type FlashOrder, type IndicatorsByTimeframe, type Judgment, type PlanCheck, type PlanOrder, type Timeframe } from "@flashmob/flash";

const TICK_MS = 60_000;
const MIN_FUNDS_USD = 1;
const SEARCH_GAP_MS = 550; // Flash allows 2 searches a second
const HOUR_MS = 3_600_000;
const MIN_BUY_USD = 1;
const MIN_EXIT_USD = 2; // below this, costs eat the order
const EXIT_GAP_MS = 5 * 60_000; // a new exit can take a moment to show up in open orders
const MAX_PLAN_ORDERS = 12;

export interface AgentDeps {
  db: Db;
  flash: FlashClient;
  searchFlash: FlashClient;
  ask(settings: AgentSettings, context: AgentContext): Promise<AgentDecision>;
  readMarket(address: string, timeframes: Timeframe[]): Promise<IndicatorsByTimeframe>;
  judge(plan: AgentPlan, symbol: string, checks: PlanCheck[]): Promise<Judgment>;
  pause?(ms: number): Promise<void>;
}

type Agent = Awaited<ReturnType<typeof activeAgents>>[number];

const isDue = (a: Agent, now: number) => {
  const { everyMinutes } = a.settings as AgentSettings;
  return !a.lastCheckAt || now - a.lastCheckAt.getTime() >= everyMinutes * 60_000;
};

const shown = (orders: PlanOrder[]) => orders.map(({ label, value }) => ({ label, value }));
const sameToken = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const ordersOn = (orders: FlashOrder[], address: string) => orders.filter((o) => sameToken(o.targetAsset.address, address));

/** Puts exits on anything held that doesn't have them. This runs every minute, so a fill is protected quickly, even between checks. */
export async function protectPositions(deps: AgentDeps, agent: Agent) {
  const { db, flash } = deps;
  const settings = agent.settings as AgentSettings;
  const exit = agentExit(settings);
  if (!exit || !hasExit(exit)) return;
  const { balances } = await flash.balances(agent.address);
  const held = settings.tokens.flatMap((address) => balances.filter((b) => b.chain === "base" && sameToken(b.address, address) && Number(b.balance) > 0).map((b) => ({ ...b, tokenAddress: address })));
  if (!held.length) return;
  const { orders } = await flash.listOrders({ funderAddress: agent.address, statuses: OPEN_STATUSES });

  for (const token of held) {
    const open = ordersOn(orders, token.tokenAddress);
    // A TWAP fills in small pieces, so its exits wait for the whole position.
    if (open.some((o) => o.side === "buy" && o.orderType === "twap")) continue;
    const covered = open.filter((o) => o.side === "sell").reduce((sum, o) => sum + Number(o.qty) - Number(o.filled?.targetAmount ?? 0), 0);
    const qty = Number(token.balance) - covered;
    const price = Number(token.notional) / Number(token.balance);
    if (!(price > 0) || qty * price < MIN_EXIT_USD) continue;

    const { symbol } = token;
    const last = await lastDecisionAt(db, agent.id, "exit", symbol);
    if (last && Date.now() - last.getTime() < EXIT_GAP_MS) continue;

    const position = await getPosition(db, agent.walletId, token.tokenAddress);
    const entry = position && position.qty > 0 && position.costUsd > 0 ? position.costUsd / position.qty : null;
    const planned = exitOrders(exit, symbol, qty, price, entry);
    const built = planned.map((o) => buildOrder({ ...o.form, tokenAddress: token.tokenAddress, funder: agent.address }));
    const base = { agentId: agent.id, action: "exit", tokenSymbol: symbol, reason: `Set its exits on ${symbol}.`, details: { orders: shown(planned) } };
    const problem = built.find((b) => "error" in b);
    if (problem && "error" in problem) {
      await recordDecision(db, { ...base, status: "refused", note: problem.error });
      continue;
    }
    const recorded = await recordDecision(db, { ...base, status: "placed" });
    for (const b of built) if ("request" in b) await enqueueJob(db, { userId: agent.userId, walletId: agent.walletId, kind: "order", payload: { request: b.request, decisionId: recorded.id } });
  }
}

/** Why it shouldn't buy this token now, even though the rules passed. */
async function heldBack(deps: AgentDeps, agent: Agent, plan: AgentPlan, token: AgentToken, orders: FlashOrder[]) {
  if (ordersOn(orders, token.address).some((o) => o.side === "buy")) return `It already has an open buy on ${token.symbol}.`;
  const { repeatHours } = plan.entry;
  if (!repeatHours) return token.heldQty * token.price >= MIN_BUY_USD ? `It already holds ${token.symbol}.` : null;
  const last = await lastDecisionAt(deps.db, agent.id, "buy", token.symbol);
  return last && Date.now() - last.getTime() < repeatHours * HOUR_MS ? `It bought ${token.symbol} less than ${repeatHours} hours ago.` : null;
}

/** A custom agent: rules are tested in code, and the model is only asked when they pass and the plan needs its judgment. */
async function checkPlan(deps: AgentDeps, agent: Agent, settings: AgentSettings, tokens: AgentToken[], orders: FlashOrder[], most: number) {
  const { db } = deps;
  const plan = settings.plan!;
  const checks: PlanCheck[] = [];
  const log = (d: { action: string; tokenSymbol?: string; amountUsd?: number; reason: string; status: "idle" | "placed" | "refused"; note?: string; details?: object }) => recordDecision(db, { agentId: agent.id, tokenSymbol: tokens[0]!.symbol, details: { checks }, ...d, reason: cleanReason(d.reason) });

  if (most < MIN_BUY_USD) return void (await log({ action: "do_nothing", reason: "It has no budget or USDC left to spend.", status: "idle" }));
  if (orders.length + (plan.entry.rungs ?? 1) > MAX_PLAN_ORDERS) return void (await log({ action: "do_nothing", reason: "It has too many open orders to add more.", status: "idle" }));

  const usesMob = plan.rules.some((r) => r.metric === "mobBuyers");
  let chosen: { token: AgentToken; read: IndicatorsByTimeframe } | undefined;
  let blocked = "";
  for (const token of tokens) {
    const read = await deps.readMarket(token.address, planTimeframes(plan));
    const mob = usesMob ? await recentBuyers(db, token.address, new Date(Date.now() - HOUR_MS), agent.userId) : 0;
    const result = checkRules(plan, token, read, mob);
    checks.push(...result.checks);
    if (!result.passed) continue;
    const reason = await heldBack(deps, agent, plan, token, orders);
    if (!reason) {
      chosen = { token, read };
      break;
    }
    blocked ||= reason;
  }
  if (!chosen) {
    const failed = checks.find((c) => !c.pass);
    return void (await log({ action: "do_nothing", reason: blocked || (failed ? failedReason(failed) : "Nothing passed."), status: "idle" }));
  }

  const { token, read } = chosen;
  let reason = `Its rules passed on ${token.symbol}.`;
  let sources: Judgment["sources"] = [];
  if (plan.judgment) {
    const verdict = await deps.judge(plan, token.symbol, checks).catch((): Judgment => ({ pass: false, reason: "It couldn't complete its judgment check, so it did nothing.", sources: [] }));
    checks.push({ label: plan.judgment, value: verdict.pass ? "Yes" : "No", pass: verdict.pass });
    sources = verdict.sources;
    reason = verdict.reason;
    if (!verdict.pass) return void (await log({ action: "do_nothing", tokenSymbol: token.symbol, reason, status: "idle", details: { checks, sources } }));
  }

  const planned = entryOrders(plan, token, read, most);
  if ("skip" in planned) return void (await log({ action: "do_nothing", tokenSymbol: token.symbol, reason: planned.skip, status: "idle" }));
  const built = planned.map((o) => buildOrder({ ...o.form, tokenAddress: token.address, funder: agent.address }));
  const problem = built.find((b) => "error" in b);
  if (problem && "error" in problem) return void (await log({ action: "buy", tokenSymbol: token.symbol, reason, status: "refused", note: problem.error }));

  const amountUsd = planned.reduce((sum, o) => sum + o.amountUsd, 0);
  const recorded = await recordDecision(db, { agentId: agent.id, action: "buy", tokenSymbol: token.symbol, amountUsd, reason: cleanReason(reason), status: "placed", details: { checks, orders: shown(planned), sources } });
  for (const [i, b] of built.entries()) {
    if ("request" in b) await enqueueJob(db, { userId: agent.userId, walletId: agent.walletId, kind: "order", payload: { request: b.request, decisionId: recorded.id, decisionUsd: planned[i]!.amountUsd } });
  }
}

/** One check: read the market, ask the model, verify in code, then queue the order. */
export async function checkAgent(deps: AgentDeps, agent: Agent) {
  const { db, flash, searchFlash } = deps;
  const settings = agent.settings as AgentSettings;
  const { balances } = await flash.balances(agent.address);
  const usdcBalance = Number(balances.find((b) => b.chain === "base" && b.address.toLowerCase() === USDC_BASE.toLowerCase())?.balance ?? 0);
  const eth = Number(balances.find((b) => b.chain === "base" && b.isNative)?.balance ?? 0);

  // An agent goes live by itself once it can both trade and pay for approvals.
  if (agent.status === "funding") {
    if (usdcBalance < MIN_FUNDS_USD || eth <= 0) return;
    await setAgentStatus(db, agent.id, "running");
  }
  if (!(await claimAgentCheck(db, agent.id, agent.lastCheckAt))) return;

  const tokens: AgentToken[] = [];
  for (const address of settings.tokens) {
    const asset = (await searchFlash.search(address, { chain: "base", limit: 1 }).catch(() => ({ assets: [] }))).assets[0];
    const held = balances.find((b) => b.chain === "base" && b.address.toLowerCase() === address.toLowerCase());
    if (asset && Number(asset.price) > 0) {
      tokens.push({ symbol: asset.symbol, address, price: Number(asset.price), change24h: Number(asset.priceChange24h ?? 0) * 100, volume24h: Number(asset.volume24h ?? 0), liquidity: Number(asset.liquidity ?? 0), heldQty: Number(held?.balance ?? 0) });
    }
    await (deps.pause ?? ((ms) => new Promise((r) => setTimeout(r, ms))))(SEARCH_GAP_MS);
  }
  if (!tokens.length) return;

  const { orders } = await flash.listOrders({ funderAddress: agent.address, statuses: OPEN_STATUSES });
  const budgetLeftUsd = Math.max(settings.budgetUsd - (await agentSpentUsd(db, agent.id)), 0);
  if (settings.plan) return checkPlan(deps, agent, settings, tokens, orders, Math.min(settings.maxTradeUsd, budgetLeftUsd, usdcBalance));
  const context: AgentContext = { tokens, budgetLeftUsd, usdcBalance, openOrders: orders.length };

  const decision = await deps.ask(settings, context);
  const base = { agentId: agent.id, action: decision.action, tokenSymbol: decision.token ?? null, reason: decision.reason };
  const checked = checkDecision(decision, settings, context);

  if ("idle" in checked) return void (await recordDecision(db, { ...base, status: "idle" }));
  if ("skip" in checked) return void (await recordDecision(db, { ...base, status: "refused", note: checked.skip }));
  const built = buildOrder({ ...checked.form, tokenAddress: checked.token.address, funder: agent.address });
  if ("error" in built) return void (await recordDecision(db, { ...base, status: "refused", note: built.error }));

  const recorded = await recordDecision(db, { ...base, status: "placed", amountUsd: decision.action === "sell" ? null : decision.amountUsd ?? null });
  await enqueueJob(db, { userId: agent.userId, walletId: agent.walletId, kind: "order", payload: { request: built.request, decisionId: recorded.id } });
}

export function startAgents(deps: AgentDeps) {
  let busy = false;
  setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      const now = Date.now();
      for (const agent of await activeAgents(deps.db)) {
        if (agent.status === "running") await protectPositions(deps, agent).catch((e) => console.error(`Agent exits failed:`, e instanceof Error ? e.message : "unknown"));
        if (agent.status === "funding" || isDue(agent, now)) await checkAgent(deps, agent).catch((e) => console.error(`Agent check failed:`, e instanceof Error ? e.message : "unknown"));
      }
    } catch (e) {
      console.error("Could not run agents:", e instanceof Error ? e.message : "unknown");
    } finally {
      busy = false;
    }
  }, TICK_MS);
}
