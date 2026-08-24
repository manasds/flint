import type { Role, SignalMessage } from "../types";

export type SocketAttachment = { role: Role };

export function deserializeRole(ws: WebSocket): Role | undefined {
  const attachment = ws.deserializeAttachment() as SocketAttachment | null;
  return attachment?.role;
}

export function isRoleTaken(sockets: WebSocket[], role: Role): boolean {
  return sockets.some((ws) => deserializeRole(ws) === role);
}

export function getOtherSocket(
  sockets: WebSocket[],
  ws: WebSocket,
  role: Role,
): WebSocket | undefined {
  const otherRole: Role = role === "sender" ? "receiver" : "sender";
  return sockets.find(
    (socket) => socket !== ws && deserializeRole(socket) === otherRole,
  );
}

export function send(ws: WebSocket, msg: SignalMessage): void {
  try {
    ws.send(JSON.stringify(msg));
  } catch {
    // Ignore send failures on closing sockets.
  }
}
