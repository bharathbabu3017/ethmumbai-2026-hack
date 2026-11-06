import { FLASH_WS_URL } from "@flashmob/flash";
import { type NextRequest } from "next/server";
import { getSession, unauthorized } from "@/lib/session";

export const dynamic = "force-dynamic";

const HEARTBEAT_TIMEOUT_MS = 10_000;

/**
 * Flash's order stream needs our API key, so the browser can't open it. This opens it here, for the signed-in
 * wallet only, and tells the page something changed. The page then reads the orders the usual way.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return unauthorized();
  const apiKey = process.env.FLASH_API_KEY!;
  const encoder = new TextEncoder();

  const body = new ReadableStream({
    start(controller) {
      const ws = new WebSocket(FLASH_WS_URL);
      let closed = false;
      let watchdog: NodeJS.Timeout;
      const close = () => {
        if (closed) return;
        closed = true;
        clearTimeout(watchdog);
        ws.close();
        controller.close();
      };
      const alive = () => {
        clearTimeout(watchdog);
        watchdog = setTimeout(close, HEARTBEAT_TIMEOUT_MS);
      };

      ws.onopen = () => {
        alive();
        ws.send(JSON.stringify({ channel: "orders", type: "subscribe", funderAddress: session.address, apiKey }));
        ws.send(JSON.stringify({ channel: "heartbeats", type: "subscribe", apiKey }));
      };
      ws.onmessage = (e) => {
        if (closed) return;
        alive();
        const frame = JSON.parse(String(e.data));
        if (frame.type === "error") return close();
        if (frame.channel === "orders" && Array.isArray(frame.orders)) controller.enqueue(encoder.encode("data: changed\n\n"));
      };
      // The browser reconnects by itself when this ends, and the new subscribe brings a fresh snapshot.
      ws.onclose = close;
      ws.onerror = close;
      req.signal.addEventListener("abort", close);
    },
  });

  return new Response(body, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", connection: "keep-alive" } });
}
