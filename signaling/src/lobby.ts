import { DurableObject } from "cloudflare:workers";
import type { LobbyClientMessage } from "../types";
import {
  deviceOf,
  findDevice,
  isRoomId,
  parseDevice,
  sendLobby,
  type LobbyAttachment,
} from "./lobby-logic";

/** Clients send "ping" this often; the runtime answers without waking us. */
const STALE_AFTER_MS = 75_000;
const SWEEP_EVERY_MS = 60_000;

/**
 * One lobby per network (see networkKey). Each open Flint tab announces
 * itself here so other devices on the same network can pick it as a
 * target. Only device names and invites pass through; transfers still run
 * through a regular Room.
 */
export class Lobby extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket upgrade.", { status: 426 });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ device: null, joinedAt: Date.now() } satisfies LobbyAttachment);
    if ((await this.ctx.storage.getAlarm()) === null) {
      await this.ctx.storage.setAlarm(Date.now() + SWEEP_EVERY_MS);
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    let msg: LobbyClientMessage;
    try {
      msg = JSON.parse(
        typeof message === "string" ? message : new TextDecoder().decode(message),
      ) as LobbyClientMessage;
    } catch {
      return;
    }

    const sockets = this.ctx.getWebSockets();

    if (msg.type === "hello") {
      const device = parseDevice(msg.device);
      if (!device) return;
      const prev = deviceOf(ws);
      // An id belongs to one socket; ignore a second tab claiming it.
      const owner = findDevice(sockets, device.id);
      if (owner && owner !== ws) return;
      if (prev && prev.id !== device.id) return;
      const attachment = ws.deserializeAttachment() as LobbyAttachment;
      ws.serializeAttachment({ ...attachment, device } satisfies LobbyAttachment);

      if (!prev) {
        const peers = sockets
          .filter((s) => s !== ws)
          .map(deviceOf)
          .filter((d) => d !== null);
        sendLobby(ws, { type: "peers", peers });
      }
      for (const s of sockets) {
        if (s !== ws && deviceOf(s)) sendLobby(s, { type: "peer", peer: device });
      }
      return;
    }

    const from = deviceOf(ws);
    if (!from || typeof msg.to !== "string" || !isRoomId(msg.roomId)) return;
    const target = findDevice(sockets, msg.to);
    if (!target || target === ws) return;

    switch (msg.type) {
      case "invite": {
        const count = Number(msg.count);
        const total = Number(msg.total);
        if (!Number.isSafeInteger(count) || count < 1 || !Number.isSafeInteger(total) || total < 0) {
          return;
        }
        sendLobby(target, { type: "invite", from, roomId: msg.roomId, count, total });
        break;
      }
      case "invite-cancel":
      case "invite-busy":
        sendLobby(target, { type: msg.type, from: from.id, roomId: msg.roomId });
        break;
    }
  }

  webSocketClose(ws: WebSocket): void {
    this.leave(ws);
  }

  webSocketError(ws: WebSocket): void {
    this.leave(ws);
    ws.close(1011, "WebSocket error");
  }

  /** Drops sockets whose client stopped pinging (e.g. a laptop went to sleep). */
  async alarm(): Promise<void> {
    const now = Date.now();
    for (const ws of this.ctx.getWebSockets()) {
      const last =
        this.ctx.getWebSocketAutoResponseTimestamp(ws)?.getTime() ??
        (ws.deserializeAttachment() as LobbyAttachment | null)?.joinedAt ??
        0;
      if (now - last > STALE_AFTER_MS) {
        this.leave(ws);
        try {
          ws.close(1001, "Stale");
        } catch {
          // Already closed.
        }
      }
    }
    if (this.ctx.getWebSockets().length) {
      await this.ctx.storage.setAlarm(now + SWEEP_EVERY_MS);
    }
  }

  private leave(ws: WebSocket) {
    const device = deviceOf(ws);
    if (!device) return;
    const attachment = ws.deserializeAttachment() as LobbyAttachment;
    // Clear it so a later close/sweep of the same socket doesn't announce twice.
    ws.serializeAttachment({ ...attachment, device: null } satisfies LobbyAttachment);
    for (const s of this.ctx.getWebSockets()) {
      if (s !== ws && deviceOf(s)) sendLobby(s, { type: "peer-left", id: device.id });
    }
  }
}
