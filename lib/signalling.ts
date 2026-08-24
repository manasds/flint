import type { Role, SignalMessage } from "./types";

export function createSignaling(
  roomId: string,
  role: Role,
  onMessage: (msg: SignalMessage) => void,
) {
  const base = (
    process.env.NEXT_PUBLIC_SIGNALING_URL ??
    "wss://flintmanasbuilds.up.railway.app"
  ).replace(/\/$/, "");
  const ws = new WebSocket(`${base}/${encodeURIComponent(roomId)}`);
  ws.onopen = () => ws.send(JSON.stringify({ type: "join", roomId, role }));
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data) as SignalMessage;
    onMessage(msg);
  };
  return {
    send: (msg: SignalMessage) => ws.send(JSON.stringify(msg)),
    close: () => ws.close(),
  };
}
