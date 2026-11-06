interface ConnectedWallet {
  address: string;
  walletClientType: string;
}

/**
 * A browser extension like Phantom can show up as connected without being part of this account,
 * so only wallets linked to the signed-in user count. A linked outside wallet wins, because that's how the user logged in.
 */
export function pickWallet<T extends ConnectedWallet>(connected: T[], linkedAddresses: string[]) {
  const linked = new Set(linkedAddresses.map((a) => a.toLowerCase()));
  const mine = connected.filter((w) => linked.has(w.address.toLowerCase()));
  return mine.find((w) => w.walletClientType !== "privy") ?? mine.find((w) => w.walletClientType === "privy");
}
