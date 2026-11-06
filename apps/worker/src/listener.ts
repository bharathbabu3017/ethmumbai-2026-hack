import {
  alertRecipients, claimUnannouncedCalls, findWallet, getCallByBracket, getCallByOrder, getOrderStatus, getTrader, getUser, moveCall,
  updateCallFields, upsertStreamOrder, type Db,
} from "@flashmob/db";
import { bracketChange, changeAlert, entryChange, OPEN_STATUSES, ownOrderAlert, publishedAlert, type OrderFrame } from "./calls";

const WS_URL = "wss://flash.definitive.fi/v1/ws";
const HEARTBEAT_TIMEOUT_MS = 10_000;
const ANNOUNCE_EVERY_MS = 2_000;

export type Send = (chatId: number, text: string) => Promise<void>;

export async function handleOrder(db: Db, send: Send, o: OrderFrame, live: boolean) {
  const wallet = await findWallet(db, o.funderAddress);
  if (!wallet) return;
  const previous = await getOrderStatus(db, o.orderId);
  await upsertStreamOrder(db, { id: o.orderId, userId: wallet.userId, walletId: wallet.id, status: o.status, raw: o });

  if (live && previous !== o.status && !OPEN_STATUSES.has(o.status)) {
    const owner = await getUser(db, wallet.userId);
    if (owner?.telegramId) await send(owner.telegramId, ownOrderAlert(o));
  }

  const entry = await getCallByOrder(db, o.orderId);
  const bracketId = o.attachedBracket?.bracketOrderId;
  if (entry && bracketId && entry.bracketOrderId !== bracketId) await updateCallFields(db, entry.id, { bracketOrderId: bracketId });

  const pair = entry ? undefined : o.sourceEntryOrderId ? await getCallByOrder(db, o.sourceEntryOrderId) : await getCallByBracket(db, o.orderId);
  const call = entry ?? pair;
  if (!call) return;

  const change = entry ? entryChange(call, o) : bracketChange(call, o);
  if (!change) return;
  const closing = change.status !== "live";
  const moved = await moveCall(db, call.id, { ...change, ...(closing ? { closedAt: new Date() } : {}) });
  if (!moved) return;

  const trader = await getTrader(db, call.traderId);
  if (!trader) return;
  const text = changeAlert(trader.displayName, call.tokenSymbol, change);
  for (const chatId of await alertRecipients(db, call.traderId)) await send(chatId, text);
}

export async function announceCalls(db: Db, send: Send) {
  for (const call of await claimUnannouncedCalls(db)) {
    const trader = await getTrader(db, call.traderId);
    if (!trader) continue;
    const text = publishedAlert(trader.displayName, call);
    for (const chatId of await alertRecipients(db, call.traderId)) await send(chatId, text);
  }
}

export function startListener(db: Db, send: Send, apiKey: string) {
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
          .then(() => handleOrder(db, send, order, frame.type === "update"))
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
  setInterval(() => {
    announceCalls(db, send).catch((err) => console.error("Could not announce calls:", err instanceof Error ? err.message : "unknown"));
  }, ANNOUNCE_EVERY_MS);
}
