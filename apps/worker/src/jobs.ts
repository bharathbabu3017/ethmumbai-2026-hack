import { claimAlert, claimJobs, claimMirror, failDecision, getAgentByUser, ownsAgentDestination, completeMirror, confirmCopy, finishJob, getPosition, getTradingWallet, getUser, mirrorExits, recordOrder, releaseCopy, releaseMirror, type Db } from "@flashmob/db";
import { buildOrder, buildUpdate, cancelMessage, feeFields, FlashError, HIGH_COST_PERCENT, mirrorPlan, OPEN_STATUSES, orderCost, prepareOrder, submitPrepared, type FlashClient, type OrderRequest, type TradeForm } from "@flashmob/flash";
import { createPublicClient, erc20Abi, http, type Hex } from "viem";
import { base } from "viem/chains";
import { withdrawAgent } from "./agent-exit";
import { signerFor, type PrivyAccess } from "./signers";
import { card } from "./trades";

const POLL_MS = 1_000;
const MAX_PRICE_MOVE = 0.02;

interface JobDeps {
  db: Db;
  flash: FlashClient;
  feeBps: string;
  rpcUrl?: string;
  privy: PrivyAccess;
  send?: (chatId: number, text: string) => Promise<void>;
}

type Job = Awaited<ReturnType<typeof claimJobs>>[number];

/**
 * A last check before the server signs: funds may only be traded on Base, and may only ever come back to this wallet.
 */
export function unsafeReason(request: OrderRequest, address: string) {
  if (request.targetChain !== "base" || request.contraChain !== "base") return "Telegram wallets only trade on Base.";
  if (request.recipientAddress && request.recipientAddress.toLowerCase() !== address.toLowerCase()) return "Funds can only go to your own wallet.";
  return null;
}

async function run(deps: JobDeps, job: Job) {
  const { db, flash, feeBps } = deps;
  const wallet = await getTradingWallet(db, job.userId);
  if (!wallet || wallet.id !== job.walletId) throw new Error("This wallet can't be used here.");
  const signer = signerFor(deps, wallet);
  const payload = job.payload as Record<string, never>;

  if (job.kind === "order") {
    const { request: asked, minReceived, copyId, decisionId } = payload as unknown as { request: OrderRequest; minReceived?: number; copyId?: string; decisionId?: string };
    // An owner can pause or stop an agent after this was queued, and that always wins.
    if (decisionId && (await getAgentByUser(db, job.userId))?.status !== "running") {
      await failDecision(db, decisionId, "The agent was paused or stopped first.");
      return { skipped: true };
    }
    const problem = unsafeReason(asked, wallet.address);
    if (problem) {
      if (copyId) await releaseCopy(db, copyId, job.userId, problem);
      throw new Error(problem);
    }
    // These are always ours to set, whatever the request says.
    const { flashIntegratorFeeBps: _ignored, ...cleaned } = asked;
    const request: OrderRequest = { ...cleaned, recipientAddress: undefined, ...feeFields(feeBps), forceMinimalAllowance: true, evmUsePermit2: true };
    let quote;
    try {
      quote = await prepareOrder(flash, wallet.address, request);
      if (minReceived !== undefined && Number(quote.to.amount) < minReceived * (1 - MAX_PRICE_MOVE)) {
        throw new Error("The price moved too much since your preview, so nothing was placed.");
      }
      // Nobody reviews an auto-copy, so one with unusually high costs is skipped. Sales are never blocked, because they're exits.
      const cost = copyId && asked.orderType === "market" ? orderCost(quote) : null;
      if (cost && cost.percent > HIGH_COST_PERCENT) {
        throw new Error(`Trading costs were ${cost.percent.toFixed(1)}% on this copy, over the ${HIGH_COST_PERCENT}% limit. Nothing was placed.`);
      }
    } catch (e) {
      // Nothing was submitted, so a reservation can be freed. After submitting we can't be sure, so it stays.
      if (copyId) await releaseCopy(db, copyId, job.userId, e instanceof Error ? e.message : "The order couldn't be placed.");
      throw e;
    }
    const { orderId } = await submitPrepared(flash, signer, request, quote);
    await recordOrder(db, { id: orderId, userId: job.userId, walletId: wallet.id, request });
    if (copyId) await confirmCopy(db, copyId, job.userId, orderId);
    return { orderId };
  }

  if (job.kind === "mirror") {
    const { mirrorId } = payload as unknown as { mirrorId: string };
    const mirror = await claimMirror(db, mirrorId, job.userId);
    if (!mirror) return { skipped: true };
    const held = (await getPosition(db, wallet.id, mirror.tokenAddress))?.qty ?? 0;
    const exits = await mirrorExits(db, wallet.id, mirror.tokenAddress, OPEN_STATUSES);
    const plan = mirrorPlan({ qty: mirror.qty, held, ...exits });

    const place = async (form: Omit<TradeForm, "tokenAddress" | "funder">) => {
      const built = buildOrder({ ...form, tokenAddress: mirror.tokenAddress, funder: wallet.address });
      if ("error" in built) throw new Error(built.error);
      const request: OrderRequest = { ...built.request, ...feeFields(feeBps), forceMinimalAllowance: true, evmUsePermit2: true };
      const { orderId } = await submitPrepared(flash, signer, request, await prepareOrder(flash, wallet.address, request));
      await recordOrder(db, { id: orderId, userId: job.userId, walletId: wallet.id, request });
      return orderId;
    };

    let orderId: string;
    try {
      for (const id of plan.cancel) {
        const message = cancelMessage(id);
        await flash.cancelOrder(id, { cancelMessage: message, userSignature: await signer.signMessage(message) });
      }
      orderId = await place({ side: "sell", type: "market", qty: plan.sellQty });
    } catch (e) {
      await releaseMirror(db, mirrorId, job.userId);
      const unprotected = plan.cancel.length ? ` Your stop and target for ${mirror.tokenSymbol} were cancelled, so it isn't protected right now.` : "";
      throw new Error(`${e instanceof Error ? e.message : "The sale failed"}.${unprotected}`);
    }
    await completeMirror(db, mirrorId, job.userId, orderId);
    if (plan.protectQty) {
      await place({ side: "sell", type: "bracket", qty: plan.protectQty, bracketStop: String(exits.stop), bracketTarget: String(exits.target) }).catch(() => {
        throw new Error(`Sold ${plan.sellQty} ${mirror.tokenSymbol}, but the new stop and target failed, so the rest isn't protected.`);
      });
    }
    return { orderId, summary: `Sold ${plan.sellQty} ${mirror.tokenSymbol}, ${mirror.percent.toFixed(0)}% of your copy.` };
  }

  if (job.kind === "copy-cancel") {
    const { orderId } = payload as unknown as { orderId: string };
    const message = cancelMessage(orderId);
    try {
      await flash.cancelOrder(orderId, { cancelMessage: message, userSignature: await signer.signMessage(message) });
    } catch (e) {
      // 422 means it already filled or closed, so there's nothing left to cancel.
      if (e instanceof FlashError && e.status === 422) return { skipped: true };
      throw e;
    }
    return { orderId };
  }

  if (job.kind === "copy-move") {
    const { orderId, limit } = payload as unknown as { orderId: string; limit: string };
    const { order } = await flash.getOrder(orderId, wallet.address);
    if (!OPEN_STATUSES.includes(order.status)) return { skipped: true };
    const { message, body } = buildUpdate(orderId, order, { limit }, new Date().toISOString());
    await flash.updateOrder(orderId, { ...body, updateMessage: message, userSignature: await signer.signMessage(message) });
    return { orderId, limit };
  }

  if (job.kind === "agent-exit") {
    const { destination, sell } = payload as unknown as { destination: string; sell: boolean };
    if (!(await ownsAgentDestination(db, job.userId, destination))) throw new Error("Funds can only go to the agent's owner.");
    const agent = await getAgentByUser(db, job.userId);
    if (agent?.status !== "stopped") throw new Error("Stop the agent before withdrawing.");
    const reader = createPublicClient({ chain: base, transport: http(deps.rpcUrl) });
    const chain = {
      tokenBalance: (token: string, owner: string) => reader.readContract({ address: token as Hex, abi: erc20Abi, functionName: "balanceOf", args: [owner as Hex] }),
      nativeBalance: (owner: string) => reader.getBalance({ address: owner as Hex }),
      wait: (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
    };
    return withdrawAgent({ flash, signer, chain, feeBps, destination, sell });
  }

  throw new Error("Unknown request.");
}

const label = (job: Job) => (job.payload as { label?: string }).label;

/** Auto-copy happens with nobody watching, so anything it can't report through a fill is sent to Telegram. */
async function tell(deps: JobDeps, job: Job, text: string) {
  const user = await getUser(deps.db, job.userId);
  if (user?.telegramId && (await claimAlert(deps.db, user.telegramId, `job:${job.id}`))) await deps.send?.(user.telegramId, text);
}

async function tellOwner(deps: JobDeps, job: Job, text: string) {
  const agent = await getAgentByUser(deps.db, job.userId);
  const owner = agent && (await getUser(deps.db, agent.ownerId));
  if (owner?.telegramId && (await claimAlert(deps.db, owner.telegramId, `job:${job.id}`))) await deps.send?.(owner.telegramId, text);
}

export async function runJob(deps: JobDeps, job: Job) {
  const automatic = job.kind === "mirror" || job.kind.startsWith("copy-") || !!label(job);
  try {
    const result = await run(deps, job);
    await finishJob(deps.db, job.id, { result });
    // A market order's fill alert says it all. One that rests needs its own note, or it would look like nothing happened.
    const request = (job.payload as { request?: OrderRequest }).request;
    if (automatic && request && request.orderType !== "market" && !("skipped" in result)) await tell(deps, job, card("🕓", `Auto-copy placed: ${label(job)}`, [], "Your order is open. You'll hear when it fills."));
    if (job.kind === "agent-exit" && "sent" in result) await tellOwner(deps, job, card("✅", "Agent stopped", [], `Sent ${(result.sent as string[]).join(", ") || "nothing"} to your wallet.`));
    if (job.kind === "copy-move" && !("skipped" in result)) {
      const { trader, limit } = job.payload as { trader: string; limit: string };
      await tell(deps, job, card("🔁", `${trader} moved their order, so yours moved too`, [["New price", `$${Number(limit).toLocaleString("en-US")}`]]));
    }
  } catch (e) {
    const known = e instanceof FlashError || (e instanceof Error && !/key|decrypt|auth/i.test(e.message));
    const error = known ? (e as Error).message : "Something went wrong. Check your orders before trying again.";
    await finishJob(deps.db, job.id, { error });
    const { decisionId } = job.payload as { decisionId?: string };
    if (decisionId) await failDecision(deps.db, decisionId, error);
    if (automatic) await tell(deps, job, card("⚠️", "Auto-copy failed", [], error));
    if (job.kind === "agent-exit") await tellOwner(deps, job, card("⚠️", "Withdrawal didn't finish", [], `${error} Your funds are safe in the agent's wallet.`));
  }
}

/** Starts running jobs. The function it returns stops claiming new ones and waits for those already running. */
export function startJobs(deps: JobDeps) {
  let running: Promise<void> | undefined;
  const tick = async () => {
    try {
      const results = await Promise.allSettled((await claimJobs(deps.db)).map((job) => runJob(deps, job)));
      for (const result of results) if (result.status === "rejected") throw result.reason;
    } catch (e) {
      // Database errors keep the real reason, such as a lost connection, in `cause`.
      const cause = e instanceof Error && e.cause instanceof Error ? e.cause.message : e instanceof Error ? e.message : "unknown";
      console.error("Could not run wallet jobs:", cause);
    }
  };
  const timer = setInterval(() => {
    running ??= tick().finally(() => { running = undefined; });
  }, POLL_MS);
  return async () => {
    clearInterval(timer);
    await running;
  };
}
