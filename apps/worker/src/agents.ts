import { activeAgents, agentSpentUsd, claimAgentCheck, enqueueJob, recordDecision, setAgentStatus, type Db } from "@flashmob/db";
import { buildOrder, checkDecision, OPEN_STATUSES, USDC_BASE, type AgentContext, type AgentDecision, type AgentSettings, type AgentToken, type FlashClient } from "@flashmob/flash";

const TICK_MS = 60_000;
const MIN_FUNDS_USD = 1;
const SEARCH_GAP_MS = 550; // Flash allows 2 searches a second

export interface AgentDeps {
  db: Db;
  flash: FlashClient;
  searchFlash: FlashClient;
  ask(settings: AgentSettings, context: AgentContext): Promise<AgentDecision>;
  pause?(ms: number): Promise<void>;
}

type Agent = Awaited<ReturnType<typeof activeAgents>>[number];

const isDue = (a: Agent, now: number) => {
  const { everyMinutes } = a.settings as AgentSettings;
  return !a.lastCheckAt || now - a.lastCheckAt.getTime() >= everyMinutes * 60_000;
};

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
        if (agent.status === "funding" || isDue(agent, now)) await checkAgent(deps, agent).catch((e) => console.error(`Agent check failed:`, e instanceof Error ? e.message : "unknown"));
      }
    } catch (e) {
      console.error("Could not run agents:", e instanceof Error ? e.message : "unknown");
    } finally {
      busy = false;
    }
  }, TICK_MS);
}
