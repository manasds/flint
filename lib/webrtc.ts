import { eventNames } from "process";
import type { SignalMessage, FileMeta } from "./types";

const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];
const CHUNK_SIZE = 16 * 1024;
const MAX_BUFFERED = 1024 * 1024;
function createPeer(send: (msg: SignalMessage) => void) {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      send({ type: "ice-candidate", candidate: event.candidate.toJSON() });
    }
  };
  return pc;
}

export function createSenderConnection(
  file: File,
  send: (msg: SignalMessage) => void,
  onProgress: (sentBytes: number) => void,
) {
  const pc = createPeer(send);
  const channel = pc.createDataChannel("file");
  channel.onopen = () => {
    sendFile();
  };
  function waitForDrain(): Promise<void> {
    return new Promise((resolve) => {
      channel.bufferedAmountLowThreshold = MAX_BUFFERED / 2;
      channel.onbufferedamountlow = () => resolve();
    });
  }
  async function sendFile() {
    const meta: FileMeta = {
      name: file.name,
      size: file.size,
      mime: file.type,
    };
    channel.send(JSON.stringify(meta));

    let offset = 0;
    while (offset < file.size) {
      if (channel.bufferedAmount > MAX_BUFFERED) {
        await waitForDrain();
      }
      const slice = file.slice(offset, offset + CHUNK_SIZE);
      const buffer = await slice.arrayBuffer();
      channel.send(buffer);
      offset += buffer.byteLength;
      onProgress(offset);
    }
    channel.send(JSON.stringify({ done: true }));
  }
  async function start() {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    send({ type: "offer", sdp: offer });
  }
  start();
  async function handleSignal(msg: SignalMessage) {
    if (msg.type === "answer") {
      await pc.setRemoteDescription(msg.sdp);
    } else if (msg.type === "ice-candidate") {
      await pc.addIceCandidate(msg.candidate);
    }
  }
  return { pc, channel, handleSignal };
}

export function createReceiverConnection(
  send: (msg: SignalMessage) => void,
  onProgress: (recievedBytes: number) => void,
  onComplete: (file: Blob, meta: FileMeta) => void,
  onMeta?: (meta: FileMeta) => void,
) {
  const pc = createPeer(send);
  let meta: FileMeta | null = null;
  const chunks: ArrayBuffer[] = [];
  let recieved = 0;

  pc.ondatachannel = (event) => {
    const channel = event.channel;
    channel.binaryType = "arraybuffer";
    channel.onmessage = (e) => {
      const data = e.data;
      if (typeof data === "string") {
        const parsed = JSON.parse(data);
        if (parsed.done) {
          const blob = new Blob(chunks, { type: meta?.mime });
          if (meta) onComplete(blob, meta);
        } else {
          meta = parsed as FileMeta;
          onMeta?.(meta);
        }
      } else {
        chunks.push(data);
        recieved += data.byteLength;
        onProgress(recieved);
      }
    };
  };
  async function handleSignal(msg: SignalMessage) {
    if (msg.type === "offer") {
      await pc.setRemoteDescription(msg.sdp);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      send({ type: "answer", sdp: answer });
    } else if (msg.type === "ice-candidate"){
      await pc.addIceCandidate(msg.candidate) ;
    }
  }
  return {pc , handleSignal} ;
}
