"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWallet } from "@/lib/wallet";

const LINKS = [
  ["/home", "Home"],
  ["/trade", "Trade"],
  ["/portfolio", "Portfolio"],
] as const;

export function Nav() {
  const path = usePathname();
  const { configured, ready, address, login, logout } = useWallet();
  return (
    <header className="topbar">
      <div className="wrap">
        <div className="row" style={{ gap: 28 }}>
          <Link href="/" className="h" style={{ fontSize: 20, fontWeight: 700 }}>Flashmob</Link>
          <nav className="row" style={{ gap: 20, fontWeight: 500 }}>
            {LINKS.map(([href, label]) => (
              <Link key={href} href={href} style={path === href ? { color: "var(--lime)" } : undefined}>{label}</Link>
            ))}
          </nav>
        </div>
        {address ? (
          <button className="btn m" onClick={logout} title="Disconnect">{address.slice(0, 6)}…{address.slice(-4)}</button>
        ) : (
          <button className="btn pri" onClick={login} disabled={!configured || !ready}>
            {configured ? "Connect wallet" : "Wallet login not set up"}
          </button>
        )}
      </div>
    </header>
  );
}
