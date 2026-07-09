import { createServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import type { Role, SignalMessage } from "./types";

const port = Number(process.env.PORT) || 8080;

type Room = { sender?: WebSocket; receiver?: WebSocket };
const rooms = new Map<string, Room>();

type SocketMeta = { roomId: string; role: Role };
const socketMeta = new WeakMap<WebSocket, SocketMeta>();

function send(ws: WebSocket, msg: SignalMessage) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

// Plain HTTP responder so platform health checks (and a browser visiting the
// URL) get a friendly 200 instead of hanging.
const server = createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/plain" });
  res.end("Flint signaling server is running.");
});

const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  ws.on("error", () => {});

  ws.on("message", (data) => {
    let msg: SignalMessage;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }

    switch (msg.type) {
      case "join": {
        const room =
          rooms.get(msg.roomId) ??
          (() => {
            const r: Room = {};
            rooms.set(msg.roomId, r);
            return r;
          })();

        if (room[msg.role]) {
          send(ws, { type: "error", message: "Role taken" });
          return;
        }

        room[msg.role] = ws;
        socketMeta.set(ws, { roomId: msg.roomId, role: msg.role });

        const other = msg.role === "sender" ? room.receiver : room.sender;
        if (other) send(other, { type: "peer-joined", role: msg.role });
        break;
      }
      case "offer":
      case "answer":
      case "ice-candidate": {
        const meta = socketMeta.get(ws);
        if (!meta) return;
        const { roomId, role } = meta;
        const room = rooms.get(roomId);
        const other = role === "sender" ? room?.receiver : room?.sender;
        if (other) send(other, msg);
        break;
      }
    }
  });

  ws.on("close", () => {
    const meta = socketMeta.get(ws);
    if (!meta) return;
    const { roomId, role } = meta;
    const room = rooms.get(roomId);
    const other = role === "sender" ? room?.receiver : room?.sender;
    if (other) send(other, { type: "peer-left", role });

    if (room && room[role] === ws) room[role] = undefined;

    if (room && !room.sender && !room.receiver) {
      rooms.delete(roomId);
    }
  });
});

server.listen(port, () => {
  console.log(`> Flint signaling server on :${port}`);
});
