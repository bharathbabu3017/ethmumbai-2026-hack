"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { WalletMenu } from "@/components/wallet-menu";
import { flash } from "@/lib/flash";
import { useWallet } from "@/lib/wallet";

const LINKS = [
  ["/home", "Discover"],
  ["/trade", "Trade"],
  ["/copying", "Copying"],
  ["/portfolio", "Portfolio"],
] as const;

export function Nav() {
  const path = usePathname();
  const { configured, ready, address, login } = useWallet();
  const [total, setTotal] = useState<number>();
  useEffect(() => {
    if (address) flash.balances(address).then((r) => setTotal(r.balances.reduce((sum, b) => sum + Number(b.notional), 0))).catch(() => {});
  }, [address, path]);
  return (
    <header className="topbar">
      <div className="wrap wide">
        <div className="row nav-left" style={{ gap: 28 }}>
          <Link href="/home" style={{ fontSize: 16, fontWeight: 600 }}>Flashmob</Link>
          <nav className="row nav-links" style={{ gap: 20 }}>
            {LINKS.map(([href, label]) => (
              <Link key={href} href={href} className={path === href ? undefined : "mut"}>{label}</Link>
            ))}
          </nav>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {address && total !== undefined && <Link href="/portfolio" className="m" style={{ fontSize: 13 }}>${total.toFixed(2)}</Link>}
          <ThemeToggle />
          {address ? (
            <WalletMenu address={address} />
          ) : (
            <button className="btn" onClick={login} disabled={!configured || !ready}>
              {configured ? "Connect" : "Wallet login not set up"}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
