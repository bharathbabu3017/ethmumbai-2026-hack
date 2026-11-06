import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { claimJobs, enqueueJob, getJob, getOrCreateWalletUser, findWallet, schema, type Db } from "@flashmob/db";
import { migrationsFolder } from "@flashmob/db/migrations";
import type { FlashClient } from "@flashmob/flash";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { runJob, startJobs, unsafeReason } from "./jobs";
import { approvedUser, fakePrivy } from "./test-helpers";

const typedData = JSON.stringify({ domain: { name: "T", chainId: 8453 }, types: { M: [{ name: "a", type: "uint256" }] }, primaryType: "M", message: { a: "1" } });
let db: Db;
let submits: any[];
let quotes: any[];
let received: string;
let owner: { userId: string; walletId: string; address: string };

const flash = {
  quote: async (b: any) => (quotes.push(b), { quoteId: "q", from: { amount: "10" }, to: { amount: received }, fees: {}, evm: { approveTx: null, permitTypedData: "", orderTypedData: typedData } }),
  submitOrder: async (b: any) => (submits.push(b), { orderId: "new-order" }),
} as unknown as FlashClient;

const request = { targetChain: "base", contraChain: "base", targetAsset: "0xt", contraAsset: "0xc", side: "buy", qty: "10", orderType: "market" };
const deps = () => ({ db, flash, privy: fakePrivy, feeBps: "10" });

async function runOne(kind: string, payload: unknown) {
  const id = await enqueueJob(db, { userId: owner.userId, walletId: owner.walletId, kind, payload });
  const [job] = await claimJobs(db);
  await runJob(deps(), job!);
  return (await getJob(db, id, owner.userId))!;
}

beforeEach(async () => {
  const pg = drizzle(new PGlite(), { schema });
  await migrate(pg, { migrationsFolder });
  db = pg as unknown as Db;
  submits = []; quotes = []; received = "0.005";
  const { user, wallet } = await approvedUser(db, 1);
  owner = { userId: user.id, walletId: wallet.id, address: wallet.address };
});

test("an order job places the order with our fee and safe approvals", async () => {
  const job = await runOne("order", { request: { ...request, flashIntegratorFeeBps: "0", forceMinimalAllowance: false }, minReceived: 0.005 });
  assert.deepEqual([job.status, (job.result as any).orderId], ["done", "new-order"]);
  assert.deepEqual([quotes[0].flashIntegratorFeeBps, quotes[0].forceMinimalAllowance], ["10", true]);
  assert.equal(submits[0].funderAddress, owner.address);
});

test("with no platform fee, none is sent, even if a request asks for one", async () => {
  const id = await enqueueJob(db, { userId: owner.userId, walletId: owner.walletId, kind: "order", payload: { request: { ...request, flashIntegratorFeeBps: "500" } } });
  const [job] = await claimJobs(db);
  await runJob({ ...deps(), feeBps: "0" }, job!);
  assert.equal((await getJob(db, id, owner.userId))!.status, "done");
  assert.equal(quotes[0].flashIntegratorFeeBps, undefined);
  assert.equal(submits[0].flashIntegratorFeeBps, undefined);
});

test("funds can't be sent to another address or another chain", async () => {
  const stolen = await runOne("order", { request: { ...request, recipientAddress: "0xattacker" } });
  assert.deepEqual([stolen.status, stolen.error], ["failed", "Funds can only go to your own wallet."]);
  const bridged = await runOne("order", { request: { ...request, contraChain: "arbitrum" } });
  assert.match(bridged.error!, /only trade on Base/);
  assert.equal(submits.length, 0);
  assert.equal(unsafeReason({ ...request, recipientAddress: owner.address } as never, owner.address.toUpperCase()), null);
});

test("nothing is placed if the price moved too far", async () => {
  received = "0.004";
  const job = await runOne("order", { request, minReceived: 0.005 });
  assert.match(job.error!, /price moved/);
  assert.equal(submits.length, 0);
});

test("a job for a wallet that isn't approved is refused", async () => {
  const web = await getOrCreateWalletUser(db, "0xWeb");
  const webWallet = (await findWallet(db, "0xWeb"))!;
  await enqueueJob(db, { userId: web, walletId: webWallet.id, kind: "order", payload: { request } });
  const [job] = await claimJobs(db);
  await runJob(deps(), job!);
  assert.equal((await getJob(db, job!.id, web))!.status, "failed");
  assert.equal(submits.length, 0);
});

test("an unknown job fails safely", async () => {
  assert.equal((await runOne("withdraw", { to: "0xattacker" })).status, "failed");
});

test("stopping waits for a running job, and claims no more", async () => {
  let release = () => {};
  const held = new Promise<void>((r) => { release = r; });
  let submitted = () => {};
  const reached = new Promise<void>((r) => { submitted = r; });
  const slow = { ...flash, submitOrder: async (b: any) => (submitted(), await held, flash.submitOrder(b)) } as unknown as FlashClient;

  const first = await enqueueJob(db, { userId: owner.userId, walletId: owner.walletId, kind: "order", payload: { request } });
  const stop = startJobs({ ...deps(), flash: slow });
  await reached;

  let stopped = false;
  const stopping = stop().then(() => { stopped = true; });
  const second = await enqueueJob(db, { userId: owner.userId, walletId: owner.walletId, kind: "order", payload: { request } });
  await new Promise((r) => setTimeout(r, 1_200));
  assert.equal(stopped, false);

  release();
  await stopping;
  assert.equal((await getJob(db, first, owner.userId))!.status, "done");
  assert.equal((await getJob(db, second, owner.userId))!.status, "queued");
});
