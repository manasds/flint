import { createServer } from "node:http";
import next from "next";
import { WebSocketServer, WebSocket } from "ws";
import type { Role, SignalMessage } from "./lib/types";

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT) || 3000;

const app = next({ dev });
const handle = app.getRequestHandler();

type Room = { sender?: WebSocket; receiver?: WebSocket };
const rooms = new Map<string, Room>();

type SocketMeta = { roomId: string; role: Role };
const socketMeta = new WeakMap<WebSocket, SocketMeta>();

function send(ws: WebSocket, msg: SignalMessage) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

app.prepare().then(() => {
  const server = createServer((req, res) => handle(req, res));
  const upgradeHandler = app.getUpgradeHandler();
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    const { pathname } = new URL(req.url ?? "/", `http://${req.headers.host}`);
    if (pathname === "/ws") {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    } else {
      upgradeHandler(req, socket, head);
    }
  });

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
      // TODO(you): remove this socket from its room and notify the other peer.
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
    console.log(`> Ready on http://localhost:${port}`);
  });
});
