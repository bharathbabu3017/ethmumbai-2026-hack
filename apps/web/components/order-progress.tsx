"use client";

import { OPEN_STATUSES, type FlashFill, type FlashOrder } from "@flashmob/flash";
import { useEffect, useRef, useState } from "react";
import { flash } from "@/lib/flash";
import { onOrderChange } from "@/lib/order-stream";
import { closeReason, usd } from "@/lib/format";

// The stream wakes this up, but it can miss an instant fill, so it still checks by itself.
const POLL_MS = 3_000;
const GIVE_UP_MS = 90_000;

interface Props {
  orderId: string;
  funder: string;
  market: boolean;
  side: string;
  symbol: string;
  onResting(): void;
  onClosed(): void;
}

/** Follows a new order from placed to its result, so the page always says what happened. */
export function OrderProgress({ orderId, funder, market, side, symbol, onResting, onClosed }: Props) {
  const [order, setOrder] = useState<FlashOrder>();
  const [fill, setFill] = useState<FlashFill>();
  const [slow, setSlow] = useState(false);
  const callbacks = useRef({ onResting, onClosed });
  callbacks.current = { onResting, onClosed };

  useEffect(() => {
    let stopped = false;
    let told = false;
    let next: ReturnType<typeof setTimeout>;
    const started = Date.now();
    const poll = async () => {
      clearTimeout(next);
      // Flash's reads can trail a new order by a moment, so a miss here just means try again.
      const found = await flash.getOrder(orderId, funder).catch(() => undefined);
      if (stopped) return;
      if (found) {
        setOrder(found.order);
        setFill(found.fills[0]);
        if (!OPEN_STATUSES.includes(found.order.status)) return callbacks.current.onClosed();
        if (!market && !told) {
          told = true;
          callbacks.current.onResting();
        }
      }
      if (Date.now() - started > GIVE_UP_MS) return setSlow(true);
      next = setTimeout(poll, POLL_MS);
    };
    void poll();
    const off = onOrderChange(() => void poll());
    return () => {
      stopped = true;
      clearTimeout(next);
      off();
    };
  }, [orderId, funder, market]);

  const open = !order || OPEN_STATUSES.includes(order.status);
  const qty = Number(order?.filled?.targetAmount ?? 0);
  const price = Number(order?.filled?.averageNotionalPrice ?? 0);
  const verb = side === "buy" ? "Bought" : "Sold";

  if (open && slow) return <p className="mut" style={{ margin: 0 }}>This is taking longer than usual. Check Pending orders and Order history.</p>;
  if (open) {
    return (
      <div className="panel row" style={{ flexWrap: "nowrap", gap: 10, padding: 14 }}>
        {market || !order ? <span className="spin" /> : <span className="pulse" aria-hidden="true" />}
        <span role="status">{market ? "Order placed. Filling now…" : order ? `Order placed. It's in Pending orders, waiting for your price.` : "Order placed. Confirming…"}</span>
      </div>
    );
  }
  if (qty > 0) {
    return (
      <div className="panel" style={{ padding: 14 }}>
        <div role="status" className="up" style={{ fontWeight: 500 }}>{verb} {Number(qty.toPrecision(4))} {symbol} at {usd(price)}</div>
        {fill?.transactionId && <a className="mut" style={{ fontSize: 13 }} href={`https://basescan.org/tx/${fill.transactionId}`} target="_blank" rel="noreferrer">View on Basescan</a>}
      </div>
    );
  }
  return (
    <div className="panel" style={{ padding: 14 }}>
      <div role="status" className="dn" style={{ fontWeight: 500 }}>Order didn&apos;t fill</div>
      <div className="mut" style={{ fontSize: 13 }}>{closeReason(order?.closeReason)}</div>
    </div>
  );
}
