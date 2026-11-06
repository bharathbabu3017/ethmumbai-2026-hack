"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { safeNext } from "@/lib/next-path";
import { useWallet } from "@/lib/wallet";

export default function MiniPage() {
  return <Suspense><Mini /></Suspense>;
}

/** Privy signs Telegram users in by itself here, so this just waits for the wallet. */
function Mini() {
  const next = safeNext(useSearchParams().get("next"));
  const { address } = useWallet();
  useEffect(() => {
    if (address) location.replace(next);
  }, [address, next]);
  return <main className="wrap" style={{ paddingTop: 80, textAlign: "center" }}><p className="mut">Opening Flashmob…</p></main>;
}
