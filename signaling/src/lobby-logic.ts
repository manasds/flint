import type { Device, DeviceKind, LobbyServerMessage } from "../types";

export type LobbyAttachment = { device: Device | null; joinedAt: number };

const KINDS: DeviceKind[] = ["desktop", "phone", "tablet"];
const MAX_NAME = 40;

/**
 * Groups devices that share a network. Behind a home router every device
 * shares one public IPv4 address; with IPv6 each device has its own address
 * but they share the /64 prefix the router hands out.
 */
export function networkKey(ip: string | null): string | null {
  if (!ip) return null;
  ip = ip.trim().toLowerCase();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(ip);
  if (mapped) ip = mapped[1];
  if (isLocalAddress(ip)) return "local";
  if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return `v4:${ip}`;
  if (!ip.includes(":")) return null;

  const [head, tail = ""] = ip.split("::");
  const left = head ? head.split(":") : [];
  const right = ip.includes("::") && tail ? tail.split(":") : [];
  const groups = ip.includes("::")
    ? [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right]
    : left;
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return `v6:${groups.slice(0, 4).map((g) => parseInt(g, 16).toString(16)).join(":")}`;
}

/**
 * Private/loopback addresses only reach the Worker in local development
 * (wrangler dev on a LAN), where every device has its own address. Treat
 * them as one network so devices can find each other while testing.
 */
function isLocalAddress(ip: string): boolean {
  return (
    /^(10|127)\./.test(ip) ||
    /^192\.168\./.test(ip) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    /^169\.254\./.test(ip) ||
    ip === "::1" ||
    /^f[cd][0-9a-f]{2}:/.test(ip) ||
    /^fe80:/.test(ip)
  );
}

/** Validates a client-supplied device description. */
export function parseDevice(value: unknown): Device | null {
  if (!value || typeof value !== "object") return null;
  const { id, name, kind } = value as Record<string, unknown>;
  if (typeof id !== "string" || !/^[a-z0-9]{8,32}$/i.test(id)) return null;
  if (typeof name !== "string") return null;
  const clean = name.replace(/\s+/g, " ").trim().slice(0, MAX_NAME);
  if (!clean) return null;
  return { id, name: clean, kind: KINDS.includes(kind as DeviceKind) ? (kind as DeviceKind) : "desktop" };
}

export function isRoomId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9]{6,32}$/i.test(value);
}

export function deviceOf(ws: WebSocket): Device | null {
  const a = ws.deserializeAttachment() as LobbyAttachment | null;
  return a?.device ?? null;
}

export function findDevice(sockets: WebSocket[], id: string): WebSocket | undefined {
  return sockets.find((ws) => deviceOf(ws)?.id === id);
}

export function sendLobby(ws: WebSocket, msg: LobbyServerMessage): void {
  try {
    ws.send(JSON.stringify(msg));
  } catch {
    // Ignore send failures on closing sockets.
  }
}
