import { DurableObject } from "cloudflare:workers";
import type { SignalMessage } from "../types";
import {
  deserializeRole,
  getOtherSocket,
  isRoleTaken,
  send,
  type SocketAttachment,
} from "./room-logic";

export class Room extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket upgrade.", { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);

    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    let msg: SignalMessage;
    try {
      msg = JSON.parse(
        typeof message === "string" ? message : new TextDecoder().decode(message),
      ) as SignalMessage;
    } catch {
      return;
    }

    const sockets = this.ctx.getWebSockets();

    switch (msg.type) {
      case "join": {
        if (isRoleTaken(sockets, msg.role)) {
          send(ws, { type: "error", message: "Role taken" });
          return;
        }

        ws.serializeAttachment({ role: msg.role } satisfies SocketAttachment);

        const other = getOtherSocket(sockets, ws, msg.role);
        if (other) send(other, { type: "peer-joined", role: msg.role });
        break;
      }
      case "offer":
      case "answer":
      case "ice-candidate": {
        const role = deserializeRole(ws);
        if (!role) return;

        const other = getOtherSocket(sockets, ws, role);
        if (other) send(other, msg);
        break;
      }
    }
  }

  webSocketClose(
    ws: WebSocket,
    _code: number,
    _reason: string,
    _wasClean: boolean,
  ): void {
    const role = deserializeRole(ws);
    if (!role) return;

    const other = getOtherSocket(this.ctx.getWebSockets(), ws, role);
    if (other) send(other, { type: "peer-left", role });
  }

  webSocketError(ws: WebSocket, _error: unknown): void {
    // Match the Node server's empty error handler; close will notify the peer.
    ws.close(1011, "WebSocket error");
  }
}
