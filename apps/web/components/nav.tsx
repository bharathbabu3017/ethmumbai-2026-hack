"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import { useWallet } from "@/lib/wallet";

const LINKS = [
  ["/home", "Traders"],
  ["/trade", "Trade"],
  ["/portfolio", "Portfolio"],
] as const;

export function Nav() {
  const path = usePathname();
  const { configured, ready, address, login, logout } = useWallet();
  return (
    <header className="topbar">
      <div className="wrap">
        <div className="row nav-left" style={{ gap: 28 }}>
          <Link href="/" style={{ fontSize: 16, fontWeight: 600 }}>Flashmob</Link>
          <nav className="row nav-links" style={{ gap: 20 }}>
            {LINKS.map(([href, label]) => (
              <Link key={href} href={href} className={path === href ? undefined : "mut"}>{label}</Link>
            ))}
          </nav>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <ThemeToggle />
          {address ? (
            <button className="btn m" onClick={logout} title="Disconnect">{address.slice(0, 6)}…{address.slice(-4)}</button>
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
