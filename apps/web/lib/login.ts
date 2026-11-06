const MAX_AGE_MS = 5 * 60 * 1000;

export const loginMessage = (host: string, address: string, issuedAt: string) =>
  `Sign in to Flashmob\nSite: ${host}\nAddress: ${address}\nIssued at: ${issuedAt}\n\nThis is free and does not move any funds.`;

/** Rejects a signed message made for another site or wallet, or one that is too old to reuse. */
export function isValidLoginMessage(message: string, host: string, address: string, now = Date.now()) {
  const issuedAt = /\nIssued at: (.+)\n/.exec(message)?.[1];
  if (!issuedAt || message !== loginMessage(host, address, issuedAt)) return false;
  const age = now - Date.parse(issuedAt);
  return age >= -60_000 && age <= MAX_AGE_MS;
}
