"use client";

import { entryPrice } from "@flashmob/flash";
import Link from "next/link";
import { useState } from "react";
import { CopyPanel } from "@/components/copy-panel";
import { Drawer } from "@/components/drawer";
import { PriceChart } from "@/components/price-chart";
import { usd } from "@/lib/format";
import type { CopyTrade } from "@/lib/copy-trade";

interface Loaded {
  trade: CopyTrade;
  trader: string;
  copyable: boolean;
  own: boolean;
  copiedUsd: number | null;
}

/** Copies one trade in a drawer, so you stay on the page you're reading. */
export function CopyButton({ orderId }: { orderId: string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Loaded>();
  const [failed, setFailed] = useState(false);

  const show = () => {
    setOpen(true);
    setFailed(false);
    fetch(`/api/trades/${orderId}`).then((r) => (r.ok ? r.json() : Promise.reject())).then(setData).catch(() => setFailed(true));
  };

  const entry = data ? entryPrice(data.trade) : null;
  return (
    <>
      <button className="btn" style={{ minHeight: 44 }} onClick={show}>Copy</button>
      {open && (
        <Drawer title="Copy this trade" onClose={() => setOpen(false)}>
          {failed && <p role="alert" className="dn" style={{ margin: 0 }}>Couldn&apos;t load this trade.</p>}
          {!data && !failed && <p className="mut" style={{ margin: 0 }}>Loading…</p>}
          {data && (
            <>
              <p className="mut" style={{ margin: 0 }}>{data.trader} bought {data.trade.tokenSymbol}{entry ? ` at ${usd(entry)}` : ""}.</p>
              <PriceChart token={data.trade.tokenAddress} height={170} levels={[{ label: "Their entry", price: entry, tone: "entry" }]} />
              {data.copiedUsd !== null ? <p className="mut" style={{ margin: 0 }}>You copied this trade with ${data.copiedUsd}. <Link href="/copying" style={{ color: "var(--text)" }}>View in Copying</Link></p>
                : data.own ? <p className="mut" style={{ margin: 0 }}>This is your trade.</p>
                : data.copyable ? <CopyPanel trade={data.trade} inDrawer />
                : <p className="mut" style={{ margin: 0 }}>This trade can&apos;t be copied any more.</p>}
            </>
          )}
        </Drawer>
      )}
    </>
  );
}
