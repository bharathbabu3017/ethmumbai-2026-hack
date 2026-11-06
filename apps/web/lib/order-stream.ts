"use client";

import { useEffect, useRef } from "react";

// Flash's reads can trail the stream by a moment, so each change is read twice.
const READ_LAG_MS = 2_000;
// Used only if the stream is down, as Flash's docs recommend.
const FALLBACK_MS = 5_000;
// The stream can miss an order that fills instantly, so an occasional read catches those.
const SAFETY_MS = 30_000;

const listeners = new Set<() => void>();
let source: EventSource | undefined;
let live = false;

function open() {
  if (source && source.readyState !== EventSource.CLOSED) return;
  source = new EventSource("/api/orders/stream");
  source.onopen = () => { live = true; };
  source.onerror = () => { live = false; };
  source.onmessage = () => listeners.forEach((listener) => listener());
}

/** Calls back when one of this wallet's orders changes. All components on a page share one connection. */
export function onOrderChange(listener: () => void) {
  listeners.add(listener);
  open();
  return () => {
    listeners.delete(listener);
    if (listeners.size) return;
    source?.close();
    source = undefined;
    live = false;
  };
}

/** Re-reads when an order changes, and falls back to polling while the stream is down. */
export function useLiveOrders(refresh: () => void) {
  const latest = useRef(refresh);
  latest.current = refresh;

  useEffect(() => {
    let last = Date.now();
    let again: ReturnType<typeof setTimeout>;
    const run = () => {
      last = Date.now();
      latest.current();
    };
    const off = onOrderChange(() => {
      run();
      clearTimeout(again);
      again = setTimeout(run, READ_LAG_MS);
    });
    const timer = setInterval(() => {
      open();
      if (Date.now() - last >= (live ? SAFETY_MS : FALLBACK_MS)) run();
    }, FALLBACK_MS);
    return () => {
      off();
      clearTimeout(again);
      clearInterval(timer);
    };
  }, []);
}
