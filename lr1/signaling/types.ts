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
