"use client";

import { useEffect, type ReactNode } from "react";

/** A panel that slides over the page, so an action never loses your place. */
export function Drawer({ title, onClose, children }: { title: string; onClose(): void; children: ReactNode }) {
  useEffect(() => {
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [onClose]);

  return (
    <>
      <div className="drawer-back" onClick={onClose} aria-hidden="true" />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={title}>
        <div className="between" style={{ alignItems: "center" }}>
          <h2 style={{ fontSize: 18 }}>{title}</h2>
          <button className="btn icon" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        {children}
      </aside>
    </>
  );
}
