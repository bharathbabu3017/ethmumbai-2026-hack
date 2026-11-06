"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useWallet } from "@/lib/wallet";

/** The landing page is for new visitors. Someone already connected goes straight to the app. */
export function SkipLanding() {
  const { address } = useWallet();
  const router = useRouter();
  useEffect(() => {
    if (address) router.replace("/home");
  }, [address, router]);
  return null;
}
