import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { USDC_BASE, type FlashClient } from "@flashmob/flash";
import type { OrderSigner } from "@flashmob/signer";
import { decodeFunctionData, erc20Abi, parseEther } from "viem";
import { withdrawAgent, type ExitChain } from "./agent-exit";

const AGENT = "0x00000000000000000000000000000000000000aa";
const OWNER = "0x00000000000000000000000000000000000000bb";
const WETH = "0x4200000000000000000000000000000000000006";

let sends: { to: string; data: string; value?: bigint }[];
let cancelled: string[];
let submitted: any[];
let held: Record<string, bigint>;
let orderStatus: string;

const row = (symbol: string, address: string, notional: string) => ({ chain: "base", symbol, address, balance: "1", notional, isNative: false });
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
const chain: ExitChain = { tokenBalance: async (t) => held[t] ?? 0n, nativeBalance: async () => parseEther("0.0005"), wait: async () => {} };
const exit = (sell: boolean) => withdrawAgent({ flash, signer, chain, feeBps: "0", destination: OWNER, sell });
const recipient = (data: string) => decodeFunctionData({ abi: erc20Abi, data: data as `0x${string}` }).args[0] as string;

beforeEach(() => {
  sends = []; cancelled = []; submitted = []; orderStatus = "ORDER_STATUS_FILLED";
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
