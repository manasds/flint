import type { Role, SignalMessage } from "./types";

export const SIGNALING_URL = (
  process.env.NEXT_PUBLIC_SIGNALING_URL ?? "wss://flintmanasbuilds.up.railway.app"
).replace(/\/$/, "");

const MAX_OUTBOX = 500;
/** How long to keep retrying "Role taken" after a reconnect (old socket lingering). */
const ROLE_TAKEN_RETRY_MS = 30_000;

export type SignalingStatus = "connecting" | "open" | "reconnecting";

export type Signaling = {
  send: (msg: SignalMessage) => void;
  close: () => void;
};

/**
 * WebSocket signaling client that reconnects with backoff and rejoins the room.
 * Messages sent while disconnected are queued and flushed after rejoin.
 * A fatal "error" (e.g. the role is genuinely taken) is passed to onMessage.
 */
export function createSignaling(
  roomId: string,
  role: Role,
  onMessage: (msg: SignalMessage) => void,
  onStatus?: (status: SignalingStatus) => void,
): Signaling {
  let ws: WebSocket | null = null;
  let closed = false;
  let attempt = 0;
  /** True once a previously open socket dropped; we are rejoining. */
  let isReconnect = false;
  let roleTakenSince = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const outbox: string[] = [];

  function connect() {
    if (closed) return;
    onStatus?.(isReconnect ? "reconnecting" : "connecting");
    const sock = new WebSocket(`${SIGNALING_URL}/${encodeURIComponent(roomId)}`);
    ws = sock;

    sock.onopen = () => {
      sock.send(JSON.stringify({ type: "join", roomId, role } satisfies SignalMessage));
      attempt = 0;
      while (outbox.length && sock.readyState === WebSocket.OPEN) {
        sock.send(outbox.shift()!);
      }
      onStatus?.("open");
    };

    sock.onmessage = (event) => {
      let msg: SignalMessage;
      try {
        msg = JSON.parse(event.data) as SignalMessage;
      } catch {
        return;
      }
      if (msg.type === "error" && msg.message === "Role taken" && isReconnect) {
        // After a network drop our previous socket may still hold the seat
        // server-side until it times out. Keep retrying for a while.
        roleTakenSince ||= Date.now();
        if (Date.now() - roleTakenSince < ROLE_TAKEN_RETRY_MS) {
          sock.close();
          return;
        }
      } else if (msg.type !== "error") {
        roleTakenSince = 0;
      }
      onMessage(msg);
    };

    sock.onclose = () => {
      if (ws !== sock) return;
      ws = null;
      if (closed) return;
      isReconnect = true;
      onStatus?.("reconnecting");
      const delay = Math.min(10_000, 500 * 2 ** attempt) * (0.75 + Math.random() / 2);
      attempt++;
      timer = setTimeout(connect, delay);
    };
  }

  connect();

  return {
    send(msg) {
      const data = JSON.stringify(msg);
      if (ws?.readyState === WebSocket.OPEN) ws.send(data);
      else if (outbox.length < MAX_OUTBOX) outbox.push(data);
    },
    close() {
      closed = true;
      if (timer) clearTimeout(timer);
      ws?.close();
      ws = null;
    },
  };
}
