// Usage: pnpm spike <quote|market|limit|bracket> [--usd 5] [--execute]
// Anything except `quote` spends real funds and needs SPIKE_PRIVATE_KEY and --execute.
import { createPrivateKeySigner } from "@flashmob/signer";
import { base } from "viem/chains";
import { cancelMessage, createFlashClient, prepareOrder, PUBLIC_DEV_KEY, submitPrepared, type OrderRequest } from "../src/index";

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

const pair = {
  targetChain: "base",
  contraChain: "base",
  targetAsset: WETH,
  contraAsset: USDC,
  side: "buy",
  qty: String(usd),
} as const;

const probe = await flash.quote({ ...pair, orderType: "market" });
const price = Number(probe.from.notional) / Number(probe.to.amount);
console.log(`WETH about $${price.toFixed(2)}. $${usd} buys ${probe.to.amount}. Fee $${probe.fees.estimatedFeeNotional}. Impact ${probe.estimatedPriceImpact}. Recommended slippage ${probe.recommendedSlippage}.`);

if (mode === "quote") process.exit(0);
const pk = process.env.SPIKE_PRIVATE_KEY as `0x${string}` | undefined;
if (!pk) throw new Error("Set SPIKE_PRIVATE_KEY to a dedicated test wallet");
if (!process.env.FLASH_API_KEY) throw new Error("Set FLASH_API_KEY so orders run under our integrator key");
const signer = createPrivateKeySigner(pk, base, process.env.BASE_RPC_URL);

const request: OrderRequest =
  mode === "limit"
    ? { ...pair, orderType: "limit", limitNotionalPrice: (price * 0.8).toFixed(2) } // far below market, so it rests
    : { ...pair, orderType: "market" };
if (mode === "bracket") {
  request.attachedBracket = {
    takeProfit: { notionalPrice: (price * 1.05).toFixed(2) },
    stopLoss: { notionalPrice: (price * 0.95).toFixed(2) },
  };
}

const quote = await prepareOrder(flash, signer.address, request);
console.log(`Plan: ${mode}, spend ${usd} USDC from ${signer.address}`);
console.log(`Needs approval: ${!!quote.evm?.approveTx}. Needs permit: ${!!quote.evm?.permitTypedData}. Bracket approval: ${!!quote.attachedBracket?.evm?.approveTx}. Setup txs: ${quote.setupTxs?.length ?? 0}.`);
if (!execute) {
  console.log("Dry run. Add --execute to spend real funds.");
  process.exit(0);
}

const started = Date.now();
const { orderId } = await submitPrepared(flash, signer, request, quote);
console.log(`Order ${orderId}`);

const OPEN = new Set(["ORDER_STATUS_PENDING", "ORDER_STATUS_ACCEPTED", "ORDER_STATUS_PARTIALLY_FILLED"]);
for (let i = 0; i < 30; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  const detail = await flash.getOrder(orderId, signer.address).catch(() => undefined);
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
  await flash.cancelOrder(orderId, { cancelMessage: message, userSignature: await signer.signMessage(message) });
  console.log("Resting limit order cancelled");
}
