/**
 * Wire protocol between sender and receiver over WebRTC data channels.
 *
 * - One ordered "control" channel carries JSON ControlMessages.
 * - DATA_CHANNELS ordered "data-N" channels carry binary chunks. Each chunk
 *   is self-describing (file index + byte offset), so chunks from different
 *   channels may interleave freely and a resumed transfer can restart at any
 *   offset. Receiver writes are positional, so duplicates are harmless.
 */

const KiB = 1024;
const MiB = 1024 * KiB;

export const CONTROL_LABEL = "control";
export const DATA_LABEL_PREFIX = "data-";
export const DATA_CHANNELS = 3;

/** Bytes read from disk per File.slice() call. */
export const SLAB_SIZE = 4 * MiB;
/** Largest chunk we will put in one message (capped by SCTP max-message-size). */
export const MAX_CHUNK_SIZE = 256 * KiB;
/** Per-channel send buffer watermarks. */
export const BUFFER_HIGH = 8 * MiB;
export const BUFFER_LOW = 2 * MiB;
/** Sender stops reading new slabs when this far ahead of the receiver's disk. */
export const FLOW_WINDOW = 64 * MiB;
export const PROGRESS_INTERVAL_MS = 200;

/** Header: u32 file index, f64 byte offset (exact up to 2^53). */
export const HEADER_BYTES = 12;

export const MAX_FILES = 10_000;
const MAX_PATH_LENGTH = 1024;

export type ManifestFile = {
  path: string;
  size: number;
  mime: string;
};

export type ControlMessage =
  /** sender → receiver, on every (re)connection. */
  | { type: "manifest"; transferId: string; files: ManifestFile[] }
  /** receiver → sender: start (or resume) from these per-file byte offsets. */
  | { type: "accept"; transferId: string; offsets: number[] }
  | { type: "decline" }
  /** receiver → sender: bytes durably written so far (contiguous, all files). */
  | { type: "progress"; written: number }
  /** receiver → sender: file `index` fully written and closed on disk. */
  | { type: "file-done"; index: number }
  /** receiver → sender: every file is written and closed. Only this means "sent". */
  | { type: "complete" }
  | { type: "cancel" };

export function chunkSizeFor(pc: RTCPeerConnection): number {
  const max = pc.sctp?.maxMessageSize;
  const limit = max && Number.isFinite(max) && max > 0 ? max : 64 * KiB;
  return Math.max(16 * KiB, Math.min(MAX_CHUNK_SIZE, limit)) - HEADER_BYTES;
}

export function encodeChunk(
  index: number,
  offset: number,
  payload: Uint8Array,
): ArrayBuffer {
  const buf = new ArrayBuffer(HEADER_BYTES + payload.byteLength);
  const view = new DataView(buf);
  view.setUint32(0, index);
  view.setFloat64(4, offset);
  new Uint8Array(buf, HEADER_BYTES).set(payload);
  return buf;
}

export function decodeChunk(
  buf: ArrayBuffer,
): { index: number; offset: number; data: Uint8Array } | null {
  if (buf.byteLength < HEADER_BYTES) return null;
  const view = new DataView(buf);
  const index = view.getUint32(0);
  const offset = view.getFloat64(4);
  if (!Number.isSafeInteger(offset) || offset < 0) return null;
  return { index, offset, data: new Uint8Array(buf, HEADER_BYTES) };
}

const isCount = (n: unknown): n is number =>
  typeof n === "number" && Number.isSafeInteger(n) && n >= 0;

/** Parses and validates an untrusted control message from the peer. */
export function parseControl(raw: unknown): ControlMessage | null {
  if (typeof raw !== "string") return null;
  let m: Record<string, unknown>;
  try {
    m = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!m || typeof m !== "object") return null;
  switch (m.type) {
    case "manifest": {
      if (typeof m.transferId !== "string" || m.transferId.length > 64) return null;
      if (!Array.isArray(m.files) || m.files.length === 0 || m.files.length > MAX_FILES)
        return null;
      const files: ManifestFile[] = [];
      for (const f of m.files as Record<string, unknown>[]) {
        if (!f || typeof f.path !== "string" || f.path.length > MAX_PATH_LENGTH) return null;
        if (!isCount(f.size)) return null;
        const mime = typeof f.mime === "string" ? f.mime.slice(0, 255) : "";
        files.push({ path: f.path, size: f.size, mime });
      }
      return { type: "manifest", transferId: m.transferId, files };
    }
    case "accept":
      if (typeof m.transferId !== "string") return null;
      if (!Array.isArray(m.offsets) || !m.offsets.every(isCount)) return null;
      return { type: "accept", transferId: m.transferId, offsets: m.offsets as number[] };
    case "progress":
      return isCount(m.written) ? { type: "progress", written: m.written } : null;
    case "file-done":
      return isCount(m.index) ? { type: "file-done", index: m.index } : null;
    case "decline":
    case "complete":
    case "cancel":
      return { type: m.type };
    default:
      return null;
  }
}

/** Splits a peer-supplied relative path into safe path segments. */
export function safePathSegments(path: string): string[] {
  const segments = path
    .replace(/\\/g, "/")
    .split("/")
    .map((s) =>
      s.replace(/[\u0000-\u001f<>:"|?*]/g, "_").trim().slice(0, 200),
    )
    .filter((s) => s && s !== "." && s !== "..");
  return segments.length ? segments : ["file"];
}

export function baseName(path: string): string {
  const segs = safePathSegments(path);
  return segs[segs.length - 1];
}

/**
 * Calls `fn` at most once per `ms`, always delivering the latest value
 * (trailing edge). `flush()` delivers immediately.
 */
export function throttle<T>(fn: (value: T) => void, ms = PROGRESS_INTERVAL_MS) {
  let last = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let latest: T;
  const fire = () => {
    timer = null;
    last = Date.now();
    fn(latest);
  };
  return {
    push(value: T) {
      latest = value;
      if (timer) return;
      const wait = ms - (Date.now() - last);
      if (wait <= 0) fire();
      else timer = setTimeout(fire, wait);
    },
    flush(value: T) {
      latest = value;
      if (timer) clearTimeout(timer);
      fire();
    },
    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}

/** Exponential moving average speed meter, sampled by the progress throttle. */
export function speedMeter() {
  let lastBytes = -1;
  let lastTime = 0;
  let speed = 0;
  return (bytes: number): number => {
    const now = performance.now();
    if (lastBytes < 0 || bytes < lastBytes) {
      lastBytes = bytes;
      lastTime = now;
      return speed;
    }
    const dt = (now - lastTime) / 1000;
    if (dt >= 0.15) {
      const instant = (bytes - lastBytes) / dt;
      speed = speed === 0 ? instant : speed * 0.7 + instant * 0.3;
      lastBytes = bytes;
      lastTime = now;
    }
    return speed;
  };
}

export function randomId(len = 12): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, len);
}
