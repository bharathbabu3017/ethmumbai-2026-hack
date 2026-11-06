// Usage: pnpm spike <quote|market|limit|bracket> [--usd 5] [--execute]
// Anything except `quote` spends real funds and needs SPIKE_PRIVATE_KEY and --execute.
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { cancelMessage, createFlashClient, PUBLIC_DEV_KEY, type QuoteRequest } from "../src/index";

const MAX_USD = 20;
const WETH = "0x4200000000000000000000000000000000000006";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

const [mode = "quote", ...rest] = process.argv.slice(2).filter((a) => a !== "--");
const execute = rest.includes("--execute");
const usdIndex = rest.indexOf("--usd");
const usd = usdIndex >= 0 ? Number(rest[usdIndex + 1]) : 5;

if (!["quote", "market", "limit", "bracket"].includes(mode)) throw new Error(`Unknown mode: ${mode}`);
if (!(usd > 0 && usd <= MAX_USD)) throw new Error(`--usd must be above 0 and at most ${MAX_USD}`);

const flash = createFlashClient({ apiKey: process.env.FLASH_API_KEY || PUBLIC_DEV_KEY });
const pk = process.env.SPIKE_PRIVATE_KEY as `0x${string}` | undefined;
const account = pk ? privateKeyToAccount(pk) : undefined;

const pair = {
  targetChain: "base",
  contraChain: "base",
  targetAsset: WETH,
  contraAsset: USDC,
  side: "buy",
  qty: String(usd),
} as const;

const probe = await flash.quote({ ...pair, orderType: "market", maxSlippage: "0.01" });
const price = Number(probe.from.notional) / Number(probe.to.amount);
console.log(`WETH about $${price.toFixed(2)}. $${usd} buys ${probe.to.amount}. Fee $${probe.fees.estimatedFeeNotional}. Impact ${probe.estimatedPriceImpact}. Recommended slippage ${probe.recommendedSlippage}.`);

if (mode === "quote") process.exit(0);
if (!account) throw new Error("Set SPIKE_PRIVATE_KEY to a dedicated test wallet");
if (!process.env.FLASH_API_KEY) throw new Error("Set FLASH_API_KEY so orders run under our integrator key");

const legs = {
  takeProfit: { notionalPrice: (price * 1.05).toFixed(2) },
  stopLoss: { notionalPrice: (price * 0.95).toFixed(2) },
};

const order: Omit<QuoteRequest, "attachedBracket"> =
  mode === "limit"
    ? { ...pair, orderType: "limit", limitNotionalPrice: (price * 0.8).toFixed(2) } // far below market, so it rests
    : { ...pair, orderType: "market", maxSlippage: "0.01" };
const request: QuoteRequest = mode === "bracket" ? { ...order, attachedBracket: legs } : order;

const quote = await flash.quote({ ...request, funderAddress: account.address });
const evm = quote.evm;
if (!evm?.orderTypedData) throw new Error("Quote came back without a signing payload");

console.log(`Plan: ${mode}, spend ${usd} USDC from ${account.address}`);
console.log(`Needs approval: ${!!evm.approveTx}. Needs permit: ${!!evm.permitTypedData}. Bracket approval: ${!!quote.attachedBracket?.evm?.approveTx}. Setup txs: ${quote.setupTxs?.length ?? 0}.`);
if (!execute) {
  console.log("Dry run. Add --execute to spend real funds.");
  process.exit(0);
}

const rpc = http(process.env.BASE_RPC_URL);
const wallet = createWalletClient({ account, chain: base, transport: rpc });
const reader = createPublicClient({ chain: base, transport: rpc });

const sendTx = async (tx: { to: string; data: string }) => {
  const hash = await wallet.sendTransaction({ to: tx.to as `0x${string}`, data: tx.data as `0x${string}`, value: 0n });
  await reader.waitForTransactionReceipt({ hash });
  console.log(`Approval tx ${hash}`);
};
const signTyped = (typedData: string) => account.signTypedData(JSON.parse(typedData));

if (evm.approveTx) await sendTx(evm.approveTx);
const permit = evm.permitTypedData
  ? { evmPermitTypedData: evm.permitTypedData, evmPermitSignature: await signTyped(evm.permitTypedData) }
  : {};

const pair2 = quote.attachedBracket;
let attachedBracket = undefined;
if (pair2?.evm) {
  if (pair2.evm.approveTx) await sendTx(pair2.evm.approveTx);
  const pairPermit = pair2.evm.permitTypedData
    ? { evmPermitTypedData: pair2.evm.permitTypedData, evmPermitSignature: await signTyped(pair2.evm.permitTypedData) }
    : {};
  attachedBracket = {
    ...legs,
    userSignature: await signTyped(pair2.evm.orderTypedData),
    salt: pair2.salt ?? undefined,
    deadline: pair2.deadline,
    signedMaxFromAmount: pair2.signedMaxFromAmount,
    ...pairPermit,
  };
}

const started = Date.now();
const { orderId } = await flash.submitOrder({
  ...order,
  funderAddress: account.address,
  quoteId: quote.quoteId,
  userSignature: await signTyped(evm.orderTypedData),
  evmOrderTypedData: evm.orderTypedData,
  ...permit,
  ...(attachedBracket ? { attachedBracket } : {}),
});
console.log(`Order ${orderId}`);

const OPEN = new Set(["ORDER_STATUS_PENDING", "ORDER_STATUS_ACCEPTED", "ORDER_STATUS_PARTIALLY_FILLED"]);
for (let i = 0; i < 30; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  const detail = await flash.getOrder(orderId, account.address).catch(() => undefined);
  if (!detail) continue;
  console.log(`${((Date.now() - started) / 1000).toFixed(1)}s ${detail.order.status} ${detail.order.closeReason ?? ""}`);
  if (mode === "limit" && OPEN.has(detail.order.status)) break;
  if (!OPEN.has(detail.order.status)) {
    console.log(JSON.stringify({ filled: detail.order.filled, attachedBracket: detail.order.attachedBracket, fills: detail.fills }, null, 2));
    break;
  }
}

if (mode === "limit") {
  const message = cancelMessage(orderId);
  await flash.cancelOrder(orderId, { cancelMessage: message, userSignature: await account.signMessage({ message }) });
  console.log("Resting limit order cancelled");
}
