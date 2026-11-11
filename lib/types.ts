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
