"use client";

import { Drawer } from "@/components/drawer";
import { WalletAddress } from "@/components/wallet-address";

export function AddFunds({ address, onClose }: { address: string; onClose(): void }) {
  return (
    <Drawer title="Add funds on Base" onClose={onClose}>
      <p className="mut" style={{ margin: 0 }}>Send USDC to trade with, and a little ETH for approvals. Funds sent on other networks won&apos;t arrive.</p>
      <WalletAddress address={address} />
    </Drawer>
  );
}
