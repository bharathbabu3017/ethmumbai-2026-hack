export interface CopyStatusInput {
  enabled: boolean;
  masterOn: boolean;
  paused: boolean;
  amountUsd: number;
  usdc: number;
  eth: number;
  spent: number;
  dailyCapUsd: number;
}

const MIN_GAS_ETH = 0.00005;

/** One plain answer to "is this working, and if not, what do I do?" */
export function copyStatus(s: CopyStatusInput): { label: string; tone: "on" | "warn" | "off"; detail: string } {
  if (!s.enabled) return { label: "Off", tone: "off", detail: "Their trades aren't being copied." };
  if (!s.masterOn) return { label: "Stopped", tone: "warn", detail: "Auto-copy is switched off for everyone right now." };
  if (s.paused) return { label: "Paused", tone: "warn", detail: "You paused all auto-copy. Nothing is being copied." };
  if (s.spent >= s.dailyCapUsd) return { label: "Daily limit reached", tone: "warn", detail: "Copying resumes once your last 24 hours drop below your limit." };
  if (s.usdc < Math.min(s.amountUsd, 1)) return { label: "Needs funds", tone: "warn", detail: "Add USDC on Base to this wallet, or trades will be skipped." };
  if (s.eth < MIN_GAS_ETH) return { label: "Needs gas", tone: "warn", detail: "Add a little ETH on Base to this wallet for token approvals." };
  return { label: "Active", tone: "on", detail: "Their next trade will be copied automatically." };
}
