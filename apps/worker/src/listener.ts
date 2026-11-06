import { alertRecipients, applyOrderFrame, findWallet, getOrder, getTraderByUser, getUser, type Db } from "@flashmob/db";
import type { FlashClient } from "@flashmob/flash";
import { OPEN_STATUSES, orderFields, ownOrderAlert, tradeAlert, type Levels, type OrderFrame } from "./trades";

const WS_URL = "wss://flash.definitive.fi/v1/ws";
const HEARTBEAT_TIMEOUT_MS = 10_000;

export type Send = (chatId: number, text: string, copyOrderId?: string) => Promise<void>;

// The stream leaves out an attached pair's prices, so they are read once from the order itself.
async function attachedLevels(flash: FlashClient, o: OrderFrame): Promise<Levels | undefined> {
  const pair = await flash.getOrder(o.orderId, o.funderAddress).then((r) => r.order.attachedBracket).catch(() => undefined);
  if (!pair) return undefined;
  const value = (leg?: { notionalPrice?: string; crossPrice?: string } | null) => Number(leg?.notionalPrice ?? leg?.crossPrice) || null;
  return { stop: value(pair.stopLoss), target: value(pair.takeProfit) };
}

const OPEN_OR_FILLED = (status: string) => OPEN_STATUSES.has(status) || status === "ORDER_STATUS_FILLED";

export async function handleOrder(db: Db, flash: FlashClient, send: Send, o: OrderFrame, live: boolean) {
  const wallet = await findWallet(db, o.funderAddress);
  if (!wallet) return;
  const trader = await getTraderByUser(db, wallet.userId);
  const known = await getOrder(db, o.orderId);
  const levels = o.attachedBracket && known?.stopPrice == null ? await attachedLevels(flash, o) : undefined;

  const { order, previousStatus, seenBefore } = await applyOrderFrame(db, orderFields(o, { userId: wallet.userId, walletId: wallet.id }, !!trader, levels));
  if (!live) return; // a snapshot only seeds state, so reconnecting never re-alerts
  const statusChanged = previousStatus !== o.status;

  if (statusChanged && !OPEN_STATUSES.has(o.status)) {
    const owner = await getUser(db, wallet.userId);
    if (owner?.telegramId) await send(owner.telegramId, ownOrderAlert(o));
  }
  if (!trader || !order.isPublic) return;
  const text = tradeAlert(trader.displayName, order, { isNew: !seenBefore, statusChanged });
  if (!text) return;
  const copyable = order.side === "buy" && OPEN_OR_FILLED(o.status);
  for (const chatId of await alertRecipients(db, trader.id)) await send(chatId, text, copyable ? order.id : undefined);
}

export function startListener(db: Db, flash: FlashClient, send: Send, apiKey: string) {
  let attempts = 0;
  // Frames are handled one at a time so a status change can't overtake the one before it.
  let queue = Promise.resolve();

  const connect = () => {
    const ws = new WebSocket(WS_URL);
    let stop = false;
    let watchdog: NodeJS.Timeout;
    const alive = () => {
      clearTimeout(watchdog);
      watchdog = setTimeout(() => ws.close(), HEARTBEAT_TIMEOUT_MS);
    };

    ws.onopen = () => {
      attempts = 0;
      alive();
      ws.send(JSON.stringify({ channel: "orders", type: "subscribe", apiKey }));
      ws.send(JSON.stringify({ channel: "heartbeats", type: "subscribe", apiKey }));
      console.log("Orders stream connected");
    };

    ws.onmessage = (e) => {
      alive();
      const frame = JSON.parse(String(e.data));
      if (frame.type === "error") {
        console.error("Orders stream error:", frame.code);
        if (frame.code === "UNAUTHORIZED") {
          stop = true;
          ws.close();
        }
        return;
      }
      if (frame.channel !== "orders" || !Array.isArray(frame.orders)) return;
      for (const order of frame.orders as OrderFrame[]) {
        queue = queue
          .then(() => handleOrder(db, flash, send, order, frame.type === "update"))
          .catch((err) => console.error("Could not handle order:", err instanceof Error ? err.message : "unknown"));
      }
    };

    ws.onclose = () => {
      clearTimeout(watchdog);
      if (stop) return;
      const backoff = Math.min(30_000, 1_000 * 2 ** attempts++);
      setTimeout(connect, backoff / 2 + Math.random() * (backoff / 2));
    };
  };

  connect();
}
