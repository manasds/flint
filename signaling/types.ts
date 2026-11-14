export type Role = "sender" | "receiver";

// The signaling server only relays these messages; it never inspects the
// SDP or ICE payloads, so they are typed loosely as `unknown` to keep this
// package free of browser (DOM) type dependencies.
export type SignalMessage =
  | { type: "join"; roomId: string; role: Role }
  | { type: "peer-joined"; role: Role }
  | { type: "peer-left"; role: Role }
  | { type: "offer"; sdp: unknown; session?: string }
  | { type: "answer"; sdp: unknown; session?: string }
  | { type: "ice-candidate"; candidate: unknown; session?: string }
  | { type: "error"; message: string };

// ---- Nearby-device lobby (one per network, see src/lobby-logic.ts) ----
// Keep in sync with lib/types.ts in the app.

export type DeviceKind = "desktop" | "phone" | "tablet";
export type Device = { id: string; name: string; kind: DeviceKind };

export type LobbyClientMessage =
  | { type: "hello"; device: Device }
  | { type: "invite"; to: string; roomId: string; count: number; total: number }
  | { type: "invite-cancel"; to: string; roomId: string }
  | { type: "invite-busy"; to: string; roomId: string };

export type LobbyServerMessage =
  | { type: "peers"; peers: Device[] }
  | { type: "peer"; peer: Device }
  | { type: "peer-left"; id: string }
  | { type: "invite"; from: Device; roomId: string; count: number; total: number }
  | { type: "invite-cancel"; from: string; roomId: string }
  | { type: "invite-busy"; from: string; roomId: string };
