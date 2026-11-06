import { copySize, type CopySettings } from "@flashmob/flash";

export interface CopyStatusInput {
  settings: CopySettings;
  approved: boolean;
  masterOn: boolean;
  paused: boolean;
  usdc: number;
  eth: number;
  spent: number;
}

const MIN_GAS_ETH = 0.00005;

/** One plain answer to "is this working, and if not, what do I do?" */
export function copyStatus(s: CopyStatusInput): { label: string; tone: "on" | "warn" | "off"; detail: string } {
  if (!s.settings.enabled) return { label: "Off", tone: "off", detail: "Their trades aren't being copied." };
  if (!s.masterOn) return { label: "Stopped", tone: "warn", detail: "Auto-copy is switched off for everyone right now." };
  if (s.paused) return { label: "Paused", tone: "warn", detail: "You paused all auto-copy. Nothing is being copied." };
  if (!s.approved) return { label: "Needs approval", tone: "warn", detail: "Approve your Flashmob wallet so trades can be placed for you." };
  const size = copySize(s.settings, s.usdc, s.spent);
  if ("skip" in size) {
    if (size.reason === "limit") return { label: "Daily limit reached", tone: "warn", detail: "Copying resumes once your last 24 hours drop below your limit." };
    if (size.reason === "small") return { label: "Amount too small", tone: "warn", detail: `${size.skip} Raise your amount or add USDC on Base.` };
    return { label: "Needs funds", tone: "warn", detail: `${size.skip} Add USDC on Base or lower your amount.` };
  }
  if (s.eth < MIN_GAS_ETH) return { label: "Needs gas", tone: "warn", detail: "Add a little ETH on Base to this wallet for token approvals." };
  return { label: "Active", tone: "on", detail: `Their next trade will be copied with $${size.amountUsd.toFixed(2)}.` };
}
