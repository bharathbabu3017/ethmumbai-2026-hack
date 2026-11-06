"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const store = new Map<string, unknown>();

/** Shows the last known value straight away and refreshes behind it, so pages never start empty or flash zeros. */
export function useCached<T>(key: string | null, load: () => Promise<T | undefined>) {
  const [data, setData] = useState<T | undefined>(() => (key ? (store.get(key) as T | undefined) : undefined));
  const latest = useRef({ key, load });
  latest.current = { key, load };

  const refresh = useCallback(() => {
    const current = latest.current.key;
    if (!current) return;
    latest.current.load().then((value) => {
      if (value === undefined) return;
      store.set(current, value);
      if (latest.current.key === current) setData(value);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    setData(key ? (store.get(key) as T | undefined) : undefined);
    refresh();
  }, [key, refresh]);

  return { data, refresh };
}
