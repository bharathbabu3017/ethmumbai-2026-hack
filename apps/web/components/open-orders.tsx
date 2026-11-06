"use client";

import { editableFields, OPEN_STATUSES, type FlashOrder } from "@flashmob/flash";
import { useCallback, useEffect, useState } from "react";
import { flash } from "@/lib/flash";
import { plainError } from "@/lib/format";
import { useWallet } from "@/lib/wallet";

const REFRESH_MS = 3_000;

const LABELS = { limit: "Limit price", trigger: "Trigger price", stop: "Stop loss", target: "Take profit" } as const;

function currentValue(o: FlashOrder, field: keyof typeof LABELS) {
  if (field === "limit") return o.limitNotionalPrice ?? o.limitCrossPrice ?? "";
  if (field === "trigger") return o.trigger?.notionalPrice ?? o.trigger?.crossPrice ?? "";
  const leg = o.brackets?.find((b) => b.triggerType === (field === "stop" ? "lower" : "upper"));
  return leg?.notionalPrice ?? leg?.crossPrice ?? "";
}

function describe(o: FlashOrder) {
  const fields = editableFields(o);
  const prices = fields.map((f) => `${LABELS[f].toLowerCase()} $${currentValue(o, f)}`).join(", ");
  return [o.qty, prices].filter(Boolean).join(" · ");
}

export function OpenOrders({ reloadKey = 0, title, onCount }: { reloadKey?: number; title?: string; onCount?(count: number): void }) {
  const { address, actions } = useWallet();
  const [orders, setOrders] = useState<FlashOrder[]>([]);
  const [editing, setEditing] = useState<string>();
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState<string>();

  const refresh = useCallback(async () => {
    if (!address) return setOrders([]);
    const { orders: open } = await flash.listOrders({ funderAddress: address, statuses: OPEN_STATUSES });
    setOrders(open);
    onCount?.(open.length);
  }, [address, onCount]);

  useEffect(() => {
    refresh().catch((e) => setError(e.message));
    // Flash's reads can trail a placement or cancel, so this keeps checking until the list catches up.
    const timer = setInterval(() => void refresh().catch(() => {}), REFRESH_MS);
    return () => clearInterval(timer);
  }, [refresh, reloadKey]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(plainError(e));
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (id: string) => {
    setCancelling(id);
    await run(() => actions.cancel(id));
    setCancelling(undefined);
  };
  const cancelAll = () => run(() => actions.cancelMany(orders.slice(0, 25).map((o) => o.orderId)));

  const startEdit = (o: FlashOrder) => {
    setEditing(o.orderId);
    setValues(Object.fromEntries(editableFields(o).map((f) => [f, currentValue(o, f)])));
  };

  const saveEdit = (o: FlashOrder) => run(async () => {
    await actions.update(o.orderId, o, values);
    setEditing(undefined);
  });

  if (!address) return null;
  return (
    <section>
      {(title || orders.length > 1) && (
        <div className="between" style={{ paddingBottom: 12, alignItems: "center" }}>
          {title ? <h2 style={{ fontSize: 18 }}>{title}</h2> : <span />}
          {orders.length > 1 && <button className="btn warn" disabled={busy} onClick={cancelAll}>Cancel all</button>}
        </div>
      )}
      {error && <p role="alert" className="dn" style={{ margin: "0 0 10px" }}>{error}</p>}
      {orders.map((o) => {
        const fields = editableFields(o);
        return (
          <div key={o.orderId} style={{ padding: "12px 0", borderTop: "1px solid var(--line)" }}>
            <div className="between" style={{ alignItems: "center", flexWrap: "wrap" }}>
              <span>
                <span style={{ fontWeight: 500, textTransform: "capitalize" }}>{o.side} {o.targetAsset.ticker}</span> <span className="mut">{o.orderType}</span>
                <span className="m mut" style={{ display: "block", fontSize: 12 }}>{describe(o)}</span>
                {o.attachedBracket && <span className="mut" style={{ display: "block", fontSize: 12 }}>Its stop and target are a separate order once it fills, so cancel that too.</span>}
              </span>
              <span className="row" style={{ gap: 6 }}>
                {fields.length > 0 && <button className="btn" disabled={busy} onClick={() => (editing === o.orderId ? setEditing(undefined) : startEdit(o))}>Edit</button>}
                <button className="btn warn" disabled={busy} onClick={() => cancel(o.orderId)}>{cancelling === o.orderId ? <><span className="spin" />Cancelling</> : "Cancel"}</button>
              </span>
            </div>
            {editing === o.orderId && (
              <div className="row" style={{ marginTop: 10, alignItems: "flex-end" }}>
                {fields.map((f) => (
                  <div key={f} style={{ flex: "1 1 120px" }}>
                    <label className="lab" htmlFor={`${o.orderId}-${f}`}>{LABELS[f]} (USD)</label>
                    <input id={`${o.orderId}-${f}`} className="inp" inputMode="decimal" value={values[f] ?? ""} onChange={(e) => setValues({ ...values, [f]: e.target.value })} />
                  </div>
                ))}
                <button className="btn pri" disabled={busy || fields.some((f) => !(Number(values[f]) > 0))} onClick={() => saveEdit(o)}>Save</button>
              </div>
            )}
          </div>
        );
      })}
      {!orders.length && <p className="mut" style={{ margin: 0, paddingTop: 12, borderTop: "1px solid var(--line)" }}>No pending orders. Limit, stop and other waiting orders appear here.</p>}
    </section>
  );
}
