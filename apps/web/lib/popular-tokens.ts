import { BASE_TOKENS, createFlashClient } from "@flashmob/flash";

const FRESH_MS = 5 * 60_000;

type Asset = Awaited<ReturnType<ReturnType<typeof createFlashClient>["search"]>>["assets"][number];

const shared = globalThis as unknown as { popularTokens?: { at: number; assets: Asset[] }; popularLoading?: Promise<Asset[]> };

async function load() {
  const flash = createFlashClient({ apiKey: process.env.FLASH_API_KEY ?? "" });
  const assets: Asset[] = [];
  for (const token of BASE_TOKENS) {
    const found = await flash.search(token.address, { chain: "base", limit: 1 }).catch(() => undefined);
    if (found?.assets[0]) assets.push(found.assets[0]);
    await new Promise((r) => setTimeout(r, 550)); // Flash allows 2 searches a second
  }
  if (assets.length) shared.popularTokens = { at: Date.now(), assets };
  return assets;
}

/** Full details for the listed tokens, cached so every visitor shares one set of calls. */
export async function getPopularTokens() {
  if (shared.popularTokens && Date.now() - shared.popularTokens.at < FRESH_MS) return shared.popularTokens.assets;
  shared.popularLoading ??= load().finally(() => (shared.popularLoading = undefined));
  return shared.popularLoading.catch(() => shared.popularTokens?.assets ?? []);
}
