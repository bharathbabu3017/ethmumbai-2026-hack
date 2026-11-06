import { createFlashClient } from "@flashmob/flash";

// The key is added server-side by /api/flash.
export const flash = createFlashClient({ apiKey: "", baseUrl: "/api/flash" });

export const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
