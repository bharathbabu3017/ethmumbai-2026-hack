"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Fades content in the first time it scrolls into view. */
export function Reveal({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) {
        el.classList.add("in");
        observer.disconnect();
      }
    }, { threshold: 0.15 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return <div ref={ref} className={`reveal ${className}`}>{children}</div>;
}
