"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { WalletMenu } from "@/components/wallet-menu";
import { ensureSession, fetchMe, postJson } from "@/lib/account";
import { useCached } from "@/lib/cached";
import { flash } from "@/lib/flash";
import { useWallet } from "@/lib/wallet";

const LINKS = [
  ["/home", "Discover"],
  ["/trade", "Trade"],
  ["/copying", "Copy Trading"],
  ["/agents", "Agents"],
  ["/portfolio", "Portfolio"],
] as const;

export function Nav() {
  const path = usePathname();
  const { configured, ready, address, login, getSigner } = useWallet();
  const { data: total, refresh } = useCached<number>(address ? `total:${address}` : null, () => flash.balances(address!).then((r) => r.balances.reduce((sum, b) => sum + Number(b.notional), 0)));
  useEffect(refresh, [refresh, path]);
  const { data: telegram } = useCached<boolean>(address ? `telegram:${address}` : null, () => fetchMe().then((me) => (me.address ? !!me.telegramLinked : undefined)));

  const linkTelegram = async () => {
    await ensureSession(getSigner);
    const { url } = await postJson<{ url: string }>("/api/telegram/link");
    window.open(url, "_blank");
  };
  return (
    <header className="topbar">
      <div className="wrap wide">
        <div className="row nav-left" style={{ gap: 28 }}>
          <Logo href="/home" />
          <nav className="row nav-links" style={{ gap: 20 }}>
            {LINKS.map(([href, label]) => (
              <Link key={href} href={href} className={path === href ? undefined : "mut"}>{label}</Link>
            ))}
          </nav>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {address && total !== undefined && <Link href="/portfolio" className="m" style={{ fontSize: 13 }}>${total.toFixed(2)}</Link>}
          {telegram === false && <button className="btn" onClick={() => void linkTelegram().catch(() => {})}>Connect Telegram</button>}
          {telegram && <span className="mut" style={{ fontSize: 13 }}>Telegram ✓</span>}
          <ThemeToggle />
          {address ? (
            <WalletMenu address={address} />
          ) : configured && !ready ? (
            <span className="btn" style={{ visibility: "hidden" }}>Connect</span>
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
