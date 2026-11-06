import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { USDC_BASE, type FlashClient } from "@flashmob/flash";
import type { OrderSigner } from "@flashmob/signer";
import { decodeFunctionData, erc20Abi, parseEther } from "viem";
import { withdrawAgent, withdrawPart, type ExitChain } from "./agent-exit";

const AGENT = "0x00000000000000000000000000000000000000aa";
const OWNER = "0x00000000000000000000000000000000000000bb";
const WETH = "0x4200000000000000000000000000000000000006";

let sends: { to: string; data: string; value?: bigint }[];
let cancelled: string[];
let submitted: any[];
let held: Record<string, bigint>;
let orderStatus: string;
let eth: bigint;

const row = (symbol: string, address: string, notional: string) => ({ chain: "base", symbol, address, balance: "1", notional, isNative: false, tokenDecimals: symbol === "USDC" ? 6 : 18 });
const flash = {
  listOrders: async () => ({ orders: [{ orderId: "open-1" }, { orderId: "open-2" }] }),
  cancelOrders: async (b: any) => (cancelled.push(...b.orderIds), { ok: true }),
  balances: async () => ({ balances: [row("USDC", USDC_BASE, "12"), row("WETH", WETH, "13"), { ...row("ETH", "0xeee", "1"), isNative: true }] }),
  quote: async () => ({ quoteId: "q", from: { amount: "1", notional: "13" }, to: { amount: "13" }, fees: {}, evm: { approveTx: null, permitTypedData: "", orderTypedData: JSON.stringify({ domain: {}, types: {}, primaryType: "Order", message: {} }) } }),
  submitOrder: async (b: any) => (submitted.push(b), { orderId: "sale-1" }),
  getOrder: async () => ({ order: { status: orderStatus } }),
} as unknown as FlashClient;
const signer: OrderSigner = {
  address: AGENT,
  signTypedData: async () => "0xsigned",
  signMessage: async () => "0xsigned",
  sendTransaction: async (tx) => (sends.push(tx), "0xhash"),
};
const chain: ExitChain = { tokenBalance: async (t) => held[t] ?? 0n, nativeBalance: async () => eth, wait: async () => {} };
const exit = (sell: boolean) => withdrawAgent({ flash, signer, chain, feeBps: "0", destination: OWNER, sell });
const recipient = (data: string) => decodeFunctionData({ abi: erc20Abi, data: data as `0x${string}` }).args[0] as string;

beforeEach(() => {
  sends = []; cancelled = []; submitted = []; orderStatus = "ORDER_STATUS_FILLED"; eth = parseEther("0.0005");
  held = { [USDC_BASE]: 12_000_000n, [WETH]: 5_000_000_000_000_000n };
});

test("keeping tokens cancels orders and sends everything to the owner, and nowhere else", async () => {
  const { sent } = await exit(false);
  assert.deepEqual(cancelled, ["open-1", "open-2"]);
  assert.equal(submitted.length, 0);
  assert.deepEqual(sent, ["USDC", "WETH", "ETH"]);
  const tokens = sends.filter((s) => s.data !== "0x");
  assert.ok(tokens.every((s) => recipient(s.data).toLowerCase() === OWNER));
  assert.equal(sends.at(-1)!.to, OWNER);
});

test("it keeps back a little ETH to pay for the last transfer", async () => {
  await exit(false);
  assert.equal(sends.at(-1)!.value, parseEther("0.0005") - parseEther("0.00002"));
});

test("selling turns tokens into USDC first, and never sells USDC", async () => {
  await exit(true);
  assert.deepEqual(submitted.map((s) => s.quoteId ?? "sold"), ["q"]);
});

test("if a sale fails, nothing is sent and the owner can try again", async () => {
  orderStatus = "ORDER_STATUS_CANCELLED";
  await assert.rejects(exit(true), /didn't fill/);
  assert.equal(sends.length, 0);
});

const part = (token: string, amount: string) => withdrawPart({ flash, signer, chain, destination: OWNER, token, amount });
const transfer = (data: string) => decodeFunctionData({ abi: erc20Abi, data: data as `0x${string}` }).args as [string, bigint];

test("part of a token goes to the owner, and the agent's orders are left alone", async () => {
  assert.deepEqual(await part(USDC_BASE, "2.5"), { sent: ["USDC"] });
  assert.equal(sends.length, 1);
  assert.equal(sends[0]!.to, USDC_BASE);
  assert.deepEqual(transfer(sends[0]!.data), [OWNER, 2_500_000n]);
  assert.deepEqual([cancelled.length, submitted.length], [0, 0]);
});

test("taking all of a token uses the real balance, in that token's own units", async () => {
  await part(WETH, "all");
  assert.deepEqual(transfer(sends[0]!.data), [OWNER, 5_000_000_000_000_000n]);
});

test("taking all the ETH keeps back the gas reserve", async () => {
  await part("eth", "all");
  assert.deepEqual([sends[0]!.to, sends[0]!.value], [OWNER, parseEther("0.0005") - parseEther("0.00002")]);
});

test("nothing is sent for more than the agent holds", async () => {
  await assert.rejects(part(USDC_BASE, "12.000001"), /more USDC/);
  await assert.rejects(part("eth", "0.00049"), /more ETH/);
  eth = parseEther("0.00001");
  await assert.rejects(part("eth", "all"), /more ETH/);
  assert.equal(sends.length, 0);
});

test("a token the agent doesn't hold is refused, so the signer can't be pointed at another contract", async () => {
  await assert.rejects(part("0x00000000000000000000000000000000000000cc", "1"), /doesn't hold/);
  await assert.rejects(part("0xeee", "1"), /doesn't hold/); // the balance row for ETH isn't a token
  assert.equal(sends.length, 0);
});

test("with no ETH for gas, it says so instead of trying", async () => {
  eth = 0n;
  await assert.rejects(part(USDC_BASE, "1"), /needs a little ETH/);
  assert.equal(sends.length, 0);
});
