"use client";

import { useState } from "react";
import { Drawer } from "@/components/drawer";

/** Shares a trade: the link opens it on Flashmob, where anyone can copy it. */
export function ShareButton({ orderId, text }: { orderId: string; text: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const link = () => `${window.location.origin}/trades/${orderId}`;

  const copy = async () => {
    await navigator.clipboard.writeText(link());
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const post = () => window.open(`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(link())}`, "_blank", "noopener");

  return (
    <>
      <button className="btn" onClick={() => setOpen(true)}>Share</button>
      {open && (
        <Drawer title="Share this trade" onClose={() => setOpen(false)}>
          <img src={`/trades/${orderId}/opengraph-image`} alt="The card people will see" style={{ width: "100%", borderRadius: 8, border: "1px solid var(--line)" }} />
          <p className="mut" style={{ margin: 0 }}>{text}</p>
          <button className="btn pri" onClick={post}>Post on X</button>
          <button className="btn" onClick={() => void copy().catch(() => {})}>{copied ? "Copied" : "Copy link"}</button>
        </Drawer>
      )}
    </>
  );
}
