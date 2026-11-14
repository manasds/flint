import { SIGNALING_URL } from "./signalling";
import type { Device, LobbyClientMessage, LobbyServerMessage } from "./types";

const PING_MS = 25_000;
const MAX_BACKOFF_MS = 30_000;

export type LobbyHandlers = {
  /** Other Flint tabs on this network, sorted by name. */
  onPeers: (peers: Device[]) => void;
  onInvite: (invite: Extract<LobbyServerMessage, { type: "invite" }>) => void;
  onInviteCancel: (from: string, roomId: string) => void;
  onInviteBusy: (from: string, roomId: string) => void;
  onOpen: (open: boolean) => void;
};

export type Lobby = {
  send: (msg: Exclude<LobbyClientMessage, { type: "hello" }>) => void;
  rename: (name: string) => void;
  close: () => void;
};

/**
 * Presence on the signaling server's per-network lobby. The server groups
 * tabs by public IP, which is how "same Wi-Fi" is detected from a browser.
 * Reconnects with backoff and re-announces itself; the peer list is rebuilt
 * from scratch on every (re)connect.
 */
export function createLobby(me: Device, handlers: LobbyHandlers): Lobby {
  let ws: WebSocket | null = null;
  let closed = false;
  let attempt = 0;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let ping: ReturnType<typeof setInterval> | null = null;
  let device = me;
  const peers = new Map<string, Device>();

  const emitPeers = () =>
    handlers.onPeers([...peers.values()].sort((a, b) => a.name.localeCompare(b.name)));

  function connect() {
    if (closed) return;
    const sock = new WebSocket(`${SIGNALING_URL}/_lobby`);
    ws = sock;

    sock.onopen = () => {
      attempt = 0;
      sock.send(JSON.stringify({ type: "hello", device } satisfies LobbyClientMessage));
      ping = setInterval(() => {
        if (sock.readyState === WebSocket.OPEN) sock.send("ping");
      }, PING_MS);
      handlers.onOpen(true);
    };

    sock.onmessage = (event) => {
      if (event.data === "pong") return;
      let msg: LobbyServerMessage;
      try {
        msg = JSON.parse(event.data) as LobbyServerMessage;
      } catch {
        return;
      }
      switch (msg.type) {
        case "peers":
          peers.clear();
          for (const p of msg.peers) peers.set(p.id, p);
          emitPeers();
          break;
        case "peer":
          peers.set(msg.peer.id, msg.peer);
          emitPeers();
          break;
        case "peer-left":
          if (peers.delete(msg.id)) emitPeers();
          break;
        case "invite":
          handlers.onInvite(msg);
          break;
        case "invite-cancel":
          handlers.onInviteCancel(msg.from, msg.roomId);
          break;
        case "invite-busy":
          handlers.onInviteBusy(msg.from, msg.roomId);
          break;
      }
    };

    sock.onclose = () => {
      if (ws !== sock) return;
      ws = null;
      if (ping) clearInterval(ping);
      ping = null;
      if (peers.size) {
        peers.clear();
        emitPeers();
      }
      handlers.onOpen(false);
      if (closed) return;
      const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** attempt) * (0.75 + Math.random() / 2);
      attempt++;
      retry = setTimeout(connect, delay);
    };
  }

  connect();

  return {
    send(msg) {
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    },
    rename(name) {
      device = { ...device, name };
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "hello", device } satisfies LobbyClientMessage));
      }
    },
    close() {
      closed = true;
      if (retry) clearTimeout(retry);
      if (ping) clearInterval(ping);
      ws?.close();
      ws = null;
    },
  };
}
