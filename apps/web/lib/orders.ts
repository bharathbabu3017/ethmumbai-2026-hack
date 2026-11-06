import { createFlashClient, USDC_BASE, type FlashOrder } from "@flashmob/flash";

export const serverFlash = () => createFlashClient({ apiKey: process.env.FLASH_API_KEY ?? "" });

/** Flash's record of an order. Reads can trail a placement by a second or two. */
export async function readOrder(orderId: string, funder: string): Promise<FlashOrder | undefined> {
  const flash = serverFlash();
  for (let i = 0; i < 6; i++) {
    const found = await flash.getOrder(orderId, funder).catch(() => undefined);
    if (found) return found.order;
    await new Promise((r) => setTimeout(r, 1000));
  }
}

/** The current USD price of a Base token, from a read-only quote. */
export async function currentPrice(tokenAddress: string) {
  const quote = await serverFlash().quote({
    targetChain: "base", contraChain: "base", targetAsset: tokenAddress, contraAsset: USDC_BASE, side: "buy", qty: "10", orderType: "market",
  });
  return Number(quote.from.notional) / Number(quote.to.amount);
}
