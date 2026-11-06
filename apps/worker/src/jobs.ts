import { claimJobs, finishJob, getBotWallet, recordOrder, type Db } from "@flashmob/db";
import { batchCancelMessage, buildUpdate, cancelMessage, FlashError, prepareOrder, submitPrepared, type FlashClient, type OrderRequest } from "@flashmob/flash";
import { createBotSigner } from "@flashmob/signer";
import { base } from "viem/chains";

const POLL_MS = 1_000;
const MAX_PRICE_MOVE = 0.02;

interface JobDeps {
  db: Db;
  flash: FlashClient;
  masterKey: Buffer;
  feeBps: string;
  rpcUrl?: string;
}

type Job = Awaited<ReturnType<typeof claimJobs>>[number];

/**
 * The website can't see this wallet's key, but a stolen session could still ask for anything.
 * So funds may only be traded on Base and may only ever come back to this wallet.
 */
export function unsafeReason(request: OrderRequest, address: string) {
  if (request.targetChain !== "base" || request.contraChain !== "base") return "Telegram wallets only trade on Base.";
  if (request.recipientAddress && request.recipientAddress.toLowerCase() !== address.toLowerCase()) return "Funds can only go to your own wallet.";
  return null;
}

async function run(deps: JobDeps, job: Job) {
  const { db, flash, masterKey, feeBps, rpcUrl } = deps;
  const wallet = await getBotWallet(db, job.userId);
  if (!wallet?.encryptedKey || wallet.id !== job.walletId) throw new Error("This wallet can't be used here.");
  const signer = createBotSigner(wallet.encryptedKey, masterKey, job.userId, base, rpcUrl);
  const payload = job.payload as Record<string, never>;

  if (job.kind === "order") {
    const { request: asked, minReceived } = payload as unknown as { request: OrderRequest; minReceived?: number };
    const problem = unsafeReason(asked, wallet.address);
    if (problem) throw new Error(problem);
    // These are always ours to set, whatever the request says.
    const request: OrderRequest = { ...asked, recipientAddress: undefined, flashIntegratorFeeBps: feeBps, forceMinimalAllowance: true, evmUsePermit2: true };
    const quote = await prepareOrder(flash, wallet.address, request);
    if (minReceived !== undefined && Number(quote.to.amount) < minReceived * (1 - MAX_PRICE_MOVE)) {
      throw new Error("The price moved too much since your preview, so nothing was placed.");
    }
    const { orderId } = await submitPrepared(flash, signer, request, quote);
    await recordOrder(db, { id: orderId, userId: job.userId, walletId: wallet.id, request });
    return { orderId };
  }

  if (job.kind === "cancel") {
    const { orderId } = payload as unknown as { orderId: string };
    const message = cancelMessage(orderId);
    await flash.cancelOrder(orderId, { cancelMessage: message, userSignature: await signer.signMessage(message) });
    return { ok: true };
  }

  if (job.kind === "cancelMany") {
    const { orderIds } = payload as unknown as { orderIds: string[] };
    const message = batchCancelMessage(orderIds);
    return flash.cancelOrders({ orderIds, cancelMessage: message, userSignature: await signer.signMessage(message) });
  }

  if (job.kind === "update") {
    const { orderId, next } = payload as unknown as { orderId: string; next: Record<string, string> };
    const { order } = await flash.getOrder(orderId, wallet.address);
    const { message, body } = buildUpdate(orderId, order, next, new Date().toISOString());
    await flash.updateOrder(orderId, { ...body, updateMessage: message, userSignature: await signer.signMessage(message) });
    return { ok: true };
  }

  throw new Error("Unknown request.");
}

export async function runJob(deps: JobDeps, job: Job) {
  try {
    await finishJob(deps.db, job.id, { result: await run(deps, job) });
  } catch (e) {
    const known = e instanceof FlashError || (e instanceof Error && !/key|decrypt|auth/i.test(e.message));
    await finishJob(deps.db, job.id, { error: known ? (e as Error).message : "Something went wrong. Check your orders before trying again." });
  }
}

export function startJobs(deps: JobDeps) {
  let busy = false;
  setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      await Promise.all((await claimJobs(deps.db)).map((job) => runJob(deps, job)));
    } catch (e) {
      console.error("Could not run wallet jobs:", e instanceof Error ? e.message : "unknown");
    } finally {
      busy = false;
    }
  }, POLL_MS);
}
