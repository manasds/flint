export type Role = "sender" | "receiver";

export type SignalMessage =
  | { type: "join"; roomId: string; role: Role }
  | { type: "peer-joined"; role: Role }
  | { type: "peer-left"; role: Role }
  | { type: "offer"; sdp: RTCSessionDescriptionInit }
  | { type: "answer"; sdp: RTCSessionDescriptionInit }
  | { type: "ice-candidate"; candidate: RTCIceCandidateInit }
  | { type: "error"; message: string };

export type FileMeta = {
  name: string;
  size: number;
  mime: string;
};
