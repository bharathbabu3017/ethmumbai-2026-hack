import { AGENT_GAS_RESERVE_ETH, batchCancelMessage, buildOrder, feeFields, NATIVE_ASSET, OPEN_STATUSES, prepareOrder, submitPrepared, USDC_BASE, WITHDRAW_ALL, type FlashClient } from "@flashmob/flash";
import type { OrderSigner } from "@flashmob/signer";
import { encodeFunctionData, erc20Abi, parseEther, parseUnits } from "viem";

const MIN_SELL_USD = 0.5;
const FILL_WAIT_MS = 30_000;
const FILL_POLL_MS = 2_000;
const GAS_RESERVE = parseEther(AGENT_GAS_RESERVE_ETH);

export interface ExitChain {
  tokenBalance(token: string, owner: string): Promise<bigint>;
  nativeBalance(owner: string): Promise<bigint>;
  wait(ms: number): Promise<void>;
}

interface Exit {
  flash: FlashClient;
  signer: OrderSigner;
  chain: ExitChain;
  feeBps: string;
  destination: string;
  sell: boolean;
}

async function waitForFill({ flash, chain }: Exit, orderId: string, funder: string, symbol: string) {
  for (let waited = 0; waited < FILL_WAIT_MS; waited += FILL_POLL_MS) {
    await chain.wait(FILL_POLL_MS);
    const found = await flash.getOrder(orderId, funder).catch(() => undefined);
    if (found?.order.status === "ORDER_STATUS_FILLED") return;
    if (found && !OPEN_STATUSES.includes(found.order.status)) throw new Error(`The sale of ${symbol} didn't fill. Try withdrawing again.`);
  }
  throw new Error(`The sale of ${symbol} is taking too long. Try withdrawing again.`);
}

/** Empties an agent's wallet into its owner's: cancels its orders, optionally sells to USDC, then sends everything. */
export async function withdrawAgent(exit: Exit) {
  const { flash, signer, chain, feeBps, destination, sell } = exit;
  const funder = signer.address;

  const { orders } = await flash.listOrders({ funderAddress: funder, statuses: OPEN_STATUSES });
  if (orders.length) {
    const orderIds = orders.map((o) => o.orderId);
    const message = batchCancelMessage(orderIds);
    await flash.cancelOrders({ orderIds, cancelMessage: message, userSignature: await signer.signMessage(message) });
  }

  const onBase = async () => (await flash.balances(funder)).balances.filter((b) => b.chain === "base" && !b.isNative);
  if (sell) {
    for (const b of await onBase()) {
      if (b.address.toLowerCase() === USDC_BASE.toLowerCase() || Number(b.notional) < MIN_SELL_USD) continue;
      const built = buildOrder({ side: "sell", type: "market", qty: b.balance, tokenAddress: b.address, funder });
      if ("error" in built) throw new Error(built.error);
      const request = { ...built.request, ...feeFields(feeBps), forceMinimalAllowance: true, evmUsePermit2: true };
      const { orderId } = await submitPrepared(flash, signer, request, await prepareOrder(flash, funder, request));
      await waitForFill(exit, orderId, funder, b.symbol);
    }
  }

  const sent: string[] = [];
  for (const b of await onBase()) {
    const amount = await chain.tokenBalance(b.address, funder);
    if (amount === 0n) continue;
    await signer.sendTransaction({ to: b.address, data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [destination as `0x${string}`, amount] }) });
    sent.push(b.symbol);
  }

  // USDC may not have been listed yet right after a sale, so it's always checked directly.
  if (!sent.includes("USDC")) {
    const usdc = await chain.tokenBalance(USDC_BASE, funder);
    if (usdc > 0n) {
      await signer.sendTransaction({ to: USDC_BASE, data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [destination as `0x${string}`, usdc] }) });
      sent.push("USDC");
    }
  }

  const eth = await chain.nativeBalance(funder);
  if (eth > GAS_RESERVE) {
    await signer.sendTransaction({ to: destination, data: "0x", value: eth - GAS_RESERVE });
    sent.push("ETH");
  }
  return { sent };
}

interface Withdrawal {
  flash: FlashClient;
  signer: OrderSigner;
  chain: ExitChain;
  destination: string;
  token: string;
  amount: string;
}

/** Sends part of one asset to the owner. The agent keeps running, and its orders are left alone. */
export async function withdrawPart({ flash, signer, chain, destination, token, amount }: Withdrawal) {
  const funder = signer.address;
  const eth = await chain.nativeBalance(funder);

  if (token === NATIVE_ASSET) {
    const most = eth > GAS_RESERVE ? eth - GAS_RESERVE : 0n;
    const wei = amount === WITHDRAW_ALL ? most : parseEther(amount);
    if (wei === 0n || wei > most) throw new Error("That's more ETH than the agent can send. A little stays behind to pay for the transfer.");
    await signer.sendTransaction({ to: destination, data: "0x", value: wei });
    return { sent: ["ETH"] };
  }

  // Only a token this wallet really holds, so a request can never point the signer at some other contract.
  const held = (await flash.balances(funder)).balances.find((b) => b.chain === "base" && !b.isNative && b.address.toLowerCase() === token.toLowerCase());
  if (!held) throw new Error("The agent doesn't hold that token.");
  if (eth === 0n) throw new Error("The agent needs a little ETH to pay for the transfer.");
  const balance = await chain.tokenBalance(held.address, funder);
  const units = amount === WITHDRAW_ALL ? balance : parseUnits(amount, held.tokenDecimals);
  if (units === 0n || units > balance) throw new Error(`That's more ${held.symbol} than the agent holds.`);
  await signer.sendTransaction({ to: held.address, data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [destination as `0x${string}`, units] }) });
  return { sent: [held.symbol] };
}
