"use client";

import Script from "next/script";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { safeNext } from "@/lib/next-path";

const LOAD_TIMEOUT_MS = 6_000;

interface TelegramWebApp {
  initData: string;
  ready(): void;
  expand(): void;
}

export default function MiniPage() {
  return <Suspense><Mini /></Suspense>;
}

function Mini() {
  const next = safeNext(useSearchParams().get("next"));
  const [message, setMessage] = useState("Opening Flashmob…");
  const started = useRef(false);

  // Telegram puts the signed data in the URL too, so sign-in doesn't depend on its script loading.
  const signIn = useCallback(async (initData: string) => {
    if (started.current) return;
    started.current = true;
    const res = await fetch("/api/telegram/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ initData }) }).catch(() => undefined);
    if (!res) return setMessage("Couldn't connect. Check your internet and try again.");
    if (!res.ok) return setMessage((await res.json()).error ?? "Couldn't sign you in.");
    sessionStorage.setItem("miniApp", "1");
    location.replace(next);
  }, [next]);

  useEffect(() => {
    const initData = new URLSearchParams(location.hash.slice(1)).get("tgWebAppData");
    if (initData) void signIn(initData);
    const timer = setTimeout(() => {
      if (!started.current) setMessage("Open this from the Flashmob bot in Telegram.");
    }, LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [signIn]);

  const onScript = () => {
    const app = (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;
    app?.ready();
    app?.expand();
    if (app?.initData) void signIn(app.initData);
    else if (!started.current) setMessage("Open this from the Flashmob bot in Telegram.");
  };

  return (
    <main className="wrap" style={{ paddingTop: 80, textAlign: "center" }}>
      <Script src="https://telegram.org/js/telegram-web-app.js" onReady={onScript} />
      <p className="mut">{message}</p>
    </main>
  );
}
