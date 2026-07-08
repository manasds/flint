import type { Role, SignalMessage } from "./types";

export function createSignaling(
  roomId: string,
  role: Role,
  onMessage: (msg: SignalMessage) => void,
) {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(`${proto}//${location.host}/ws`);
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
