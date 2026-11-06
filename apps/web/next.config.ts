import type { NextConfig } from "next";

// Secrets live in the repo's root .env locally. Hosted deploys set them directly.
try {
  process.loadEnvFile("../../.env");
} catch {}

const config: NextConfig = {
  transpilePackages: ["@flashmob/flash", "@flashmob/db"],
  agentRules: false,
  env: {
    NEXT_PUBLIC_PRIVY_APP_ID: process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "",
    NEXT_PUBLIC_PRIVY_SIGNER_ID: process.env.NEXT_PUBLIC_PRIVY_SIGNER_ID ?? "",
    NEXT_PUBLIC_PRIVY_TELEGRAM: process.env.NEXT_PUBLIC_PRIVY_TELEGRAM ?? "",
  },
};

export default config;
