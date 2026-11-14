export type Role = "sender" | "receiver";

/**
 * Messages relayed by the signaling server. `session` identifies one
 * RTCPeerConnection generation so stale offers/candidates from a replaced
 * connection are never applied to the new one. The server relays these
 * objects verbatim, so the extra field needs no server change.
 */
export type SignalMessage =
  | { type: "join"; roomId: string; role: Role }
  | { type: "peer-joined"; role: Role }
  | { type: "peer-left"; role: Role }
  | { type: "offer"; sdp: RTCSessionDescriptionInit; session: string }
  | { type: "answer"; sdp: RTCSessionDescriptionInit; session: string }
  | { type: "ice-candidate"; candidate: RTCIceCandidateInit; session: string }
  | { type: "error"; message: string };

export type SessionSignal = Extract<
  SignalMessage,
  { type: "offer" | "answer" | "ice-candidate" }
>;

// ---- Nearby-device lobby. Keep in sync with signaling/types.ts. ----

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
