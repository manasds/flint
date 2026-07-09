import type { Role, SignalMessage } from "./types";

export function createSignaling(
  roomId: string,
  role: Role,
  onMessage: (msg: SignalMessage) => void,
) {
  const url = process.env.NEXT_PUBLIC_SIGNALING_URL ?? "ws://localhost:8080";
  const ws = new WebSocket(url);
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
