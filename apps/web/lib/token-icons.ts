import { BASE_TOKENS, createFlashClient } from "@flashmob/flash";

const NATIVE = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

const shared = globalThis as unknown as { tokenIcons?: Map<string, string | null>; iconQueue?: Promise<unknown> };

/** A token's logo. Logos rarely change, so each is looked up once, one at a time within the search key's limit. */
export function getTokenIcon(address: string) {
  const icons = (shared.tokenIcons ??= new Map());
  const key = address.toLowerCase();
  if (icons.has(key)) return Promise.resolve(icons.get(key) ?? null);
  const lookup = key === NATIVE ? BASE_TOKENS[0]!.address : address;
  const flash = createFlashClient({ apiKey: process.env.FLASH_API_KEY ?? "" });
  const next = (shared.iconQueue ?? Promise.resolve()).then(async () => {
    if (icons.has(key)) return icons.get(key) ?? null;
    const { assets } = await flash.search(lookup, { chain: "base", limit: 1 });
    const image = assets.find((a) => a.address.toLowerCase() === lookup.toLowerCase())?.imageUrl ?? null;
    icons.set(key, image);
    await new Promise((r) => setTimeout(r, 550)); // Flash allows 2 searches a second
    return image;
  }).catch(() => null);
  shared.iconQueue = next;
  return next;
}
