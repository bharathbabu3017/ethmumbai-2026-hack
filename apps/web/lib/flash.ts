import { createFlashClient } from "@flashmob/flash";

// The key is added server-side by /api/flash.
export const flash = createFlashClient({ apiKey: "", baseUrl: "/api/flash" });
