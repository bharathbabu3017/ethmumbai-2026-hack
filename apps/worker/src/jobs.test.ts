import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { beforeEach, test } from "node:test";
import { claimJobs, enqueueJob, getJob, getOrCreateTelegramUser, getOrCreateWalletUser, findWallet, schema, type Db } from "@flashmob/db";
import { migrationsFolder } from "@flashmob/db/migrations";
import type { FlashClient } from "@flashmob/flash";
import { generateBotWallet } from "@flashmob/signer";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { runJob, unsafeReason } from "./jobs";

const masterKey = randomBytes(32);
const typedData = JSON.stringify({ domain: { name: "T", chainId: 8453 }, types: { M: [{ name: "a", type: "uint256" }] }, primaryType: "M", message: { a: "1" } });
let db: Db;
let submits: any[];
let quotes: any[];
let cancels: any[];
let received: string;
let owner: { userId: string; walletId: string; address: string };

const flash = {
  quote: async (b: any) => (quotes.push(b), { quoteId: "q", from: { amount: "10" }, to: { amount: received }, fees: {}, evm: { approveTx: null, permitTypedData: "", orderTypedData: typedData } }),
  submitOrder: async (b: any) => (submits.push(b), { orderId: "new-order" }),
  cancelOrder: async (id: string, b: any) => (cancels.push([id, b]), { ok: true }),
} as unknown as FlashClient;

const request = { targetChain: "base", contraChain: "base", targetAsset: "0xt", contraAsset: "0xc", side: "buy", qty: "10", orderType: "market" };
const deps = () => ({ db, flash, masterKey, feeBps: "10" });

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
  submits = []; quotes = []; cancels = []; received = "0.005";
  const { user, wallet } = await getOrCreateTelegramUser(db, { id: 1 }, (id) => generateBotWallet(masterKey, id));
  owner = { userId: user.id, walletId: wallet.id, address: wallet.address };
});

test("an order job places the order with our fee and safe approvals", async () => {
  const job = await runOne("order", { request: { ...request, flashIntegratorFeeBps: "0", forceMinimalAllowance: false }, minReceived: 0.005 });
  assert.deepEqual([job.status, (job.result as any).orderId], ["done", "new-order"]);
  assert.deepEqual([quotes[0].flashIntegratorFeeBps, quotes[0].forceMinimalAllowance], ["10", true]);
  assert.equal(submits[0].funderAddress, owner.address);
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

test("a job for a wallet that isn't the user's Telegram wallet is refused", async () => {
  const web = await getOrCreateWalletUser(db, "0xWeb");
  const webWallet = (await findWallet(db, "0xWeb"))!;
  await enqueueJob(db, { userId: web, walletId: webWallet.id, kind: "order", payload: { request } });
  const [job] = await claimJobs(db);
  await runJob(deps(), job!);
  assert.equal((await getJob(db, job!.id, web))!.status, "failed");
  assert.equal(submits.length, 0);
});

test("a cancel job signs with the wallet", async () => {
  const job = await runOne("cancel", { orderId: "o1" });
  assert.equal(job.status, "done");
  assert.match(cancels[0][1].userSignature, /^0x/);
});

test("an unknown job fails safely", async () => {
  assert.equal((await runOne("withdraw", { to: "0xattacker" })).status, "failed");
});
