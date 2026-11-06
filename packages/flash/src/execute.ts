import type { FlashClient, QuoteRequest, QuoteResponse, SubmitOrderRequest } from "./client";

export interface OrderSigner {
  address: string;
  signTypedData(typedData: string): Promise<string>;
  sendTransaction(tx: { to: string; data: string }): Promise<string>;
}

export type OrderRequest = Omit<QuoteRequest, "funderAddress">;

// These only apply when quoting and are not part of the submit body.
const QUOTE_ONLY = ["durationSeconds", "expireTime", "evmUsePermit2", "forceMinimalAllowance", "svmUseNativeSOL", "attachedBracket"] as const;

export const prepareOrder = (flash: FlashClient, funderAddress: string, request: OrderRequest) =>
  flash.quote({ ...request, funderAddress });

/** Runs approvals, signs and submits an order. Do not retry after a failure: re-quote and ask again. */
export async function submitPrepared(flash: FlashClient, signer: OrderSigner, request: OrderRequest, quote: QuoteResponse) {
  const evm = quote.evm;
  if (!evm?.orderTypedData) throw new Error("Quote has no EVM signing payload");

  const body = { ...request } as Record<string, unknown>;
  for (const key of QUOTE_ONLY) delete body[key];

  if (evm.approveTx) await signer.sendTransaction(evm.approveTx);
  const permit = evm.permitTypedData
    ? { evmPermitTypedData: evm.permitTypedData, evmPermitSignature: await signer.signTypedData(evm.permitTypedData) }
    : {};

  let attachedBracket: SubmitOrderRequest["attachedBracket"];
  const pair = quote.attachedBracket;
  if (request.attachedBracket) {
    if (!pair?.evm) throw new Error("Quote has no signing payload for the bracket");
    if (pair.evm.approveTx) await signer.sendTransaction(pair.evm.approveTx);
    const pairPermit = pair.evm.permitTypedData
      ? { evmPermitTypedData: pair.evm.permitTypedData, evmPermitSignature: await signer.signTypedData(pair.evm.permitTypedData) }
      : {};
    attachedBracket = {
      takeProfit: request.attachedBracket.takeProfit,
      stopLoss: request.attachedBracket.stopLoss,
      userSignature: await signer.signTypedData(pair.evm.orderTypedData),
      salt: pair.salt ?? undefined,
      deadline: pair.deadline,
      signedMaxFromAmount: pair.signedMaxFromAmount,
      ...pairPermit,
    };
  }

  return flash.submitOrder({
    ...(body as Omit<SubmitOrderRequest, "funderAddress" | "userSignature">),
    funderAddress: signer.address,
    quoteId: quote.quoteId,
    ...(quote.bridgeQuoteId ? { bridgeQuoteId: quote.bridgeQuoteId } : {}),
    userSignature: await signer.signTypedData(evm.orderTypedData),
    evmOrderTypedData: evm.orderTypedData,
    ...permit,
    ...(attachedBracket ? { attachedBracket } : {}),
  });
}
