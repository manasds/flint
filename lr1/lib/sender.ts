import type { SendItem } from "./files";
import { PeerLink, type PeerHealth } from "./peer";
import {
  BUFFER_HIGH,
  BUFFER_LOW,
  CONTROL_LABEL,
  DATA_CHANNELS,
  DATA_LABEL_PREFIX,
  FLOW_WINDOW,
  SLAB_SIZE,
  chunkSizeFor,
  encodeChunk,
  parseControl,
  randomId,
  speedMeter,
  throttle,
  type ControlMessage,
  type ManifestFile,
} from "./protocol";
import { createSignaling, type Signaling } from "./signalling";
import type { SignalMessage } from "./types";

export type SenderPhase =
  | "waiting" // link shared, no receiver yet
  | "connecting"
  | "awaiting-accept" // receiver is looking at the file list
  | "transferring"
  | "finishing" // everything sent; waiting for the receiver's final ack
  | "reconnecting"
  | "done" // receiver confirmed every file is on disk
  | "declined"
  | "cancelled"
  | "error";

export type SenderSnapshot = {
  phase: SenderPhase;
  message?: string;
  /** Bytes the receiver has confirmed writing. */
  written: number;
  total: number;
  speed: number;
  filesDone: number;
  fileCount: number;
};

type Job = { index: number; start: number; end: number };

const FINAL_PHASES: SenderPhase[] = ["done", "declined", "cancelled", "error"];

export class SenderSession {
  readonly transferId = randomId();
  private readonly manifest: ManifestFile[];
  private readonly total: number;
  private sig: Signaling | null = null;
  private link: PeerLink | null = null;
  private control: RTCDataChannel | null = null;
  private channels: RTCDataChannel[] = [];
  /** Bumped whenever the current link/pump is torn down; stale loops exit. */
  private gen = 0;
  private phase: SenderPhase = "waiting";
  private message: string | undefined;
  private accepted = false;
  /** All bytes handed to channels for the current generation. */
  private pumpDrained = false;
  private receiverPresent = false;
  private written = 0;
  /** Bytes handed to data channels in the current generation (plus resume base). */
  private queued = 0;
  private filesDone = new Set<number>();
  private wakers = new Set<() => void>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly meter = speedMeter();
  private readonly emitter: ReturnType<typeof throttle<void>>;

  constructor(
    private readonly items: SendItem[],
    private readonly roomId: string,
    private readonly onChange: (snapshot: SenderSnapshot) => void,
  ) {
    this.manifest = items.map(({ file, path }) => ({
      path,
      size: file.size,
      mime: file.type,
    }));
    this.total = this.manifest.reduce((sum, f) => sum + f.size, 0);
    this.emitter = throttle<void>(() =>
      this.onChange({
        phase: this.phase,
        message: this.message,
        written: this.written,
        total: this.total,
        speed: this.phase === "transferring" || this.phase === "finishing" ? this.meter(this.written) : 0,
        filesDone: this.filesDone.size,
        fileCount: this.manifest.length,
      }),
    );
  }

  get finished() {
    return FINAL_PHASES.includes(this.phase);
  }

  /** True while closing the tab would interrupt a transfer. */
  get busy() {
    return this.accepted && !this.finished;
  }

  start() {
    this.sig = createSignaling(this.roomId, "sender", (msg) => this.onSignal(msg));
    this.emitter.flush();
  }

  cancel() {
    if (this.finished) return;
    this.sendControl({ type: "cancel" });
    this.finish("cancelled", "Transfer cancelled.");
  }

  dispose() {
    this.phase = this.phase === "done" ? "done" : "cancelled";
    this.emitter.cancel();
    this.teardownLink();
    this.sig?.close();
    this.sig = null;
  }

  // ---- signaling --------------------------------------------------------

  private onSignal(msg: SignalMessage) {
    if (this.finished) return;
    switch (msg.type) {
      case "peer-joined":
        if (msg.role !== "receiver") return;
        this.receiverPresent = true;
        // A (re)joined receiver needs a fresh connection; resume picks up
        // from the byte offsets it reports, so nothing is re-sent needlessly.
        this.connect();
        break;
      case "peer-left":
        this.receiverPresent = false;
        if (this.link?.pc.connectionState !== "connected") {
          this.setPhase(
            this.accepted || this.phase !== "waiting" ? "reconnecting" : "waiting",
            "Receiver went offline. Waiting for them to come back…",
          );
        }
        break;
      case "offer":
      case "answer":
      case "ice-candidate":
        this.link?.handleSignal(msg);
        break;
      case "error":
        this.finish(
          "error",
          msg.message === "Role taken" ? "This share link is already in use." : msg.message,
        );
        break;
    }
  }

  private connect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.teardownLink();
    const gen = this.gen;
    const link = new PeerLink({
      session: randomId(),
      offerer: true,
      send: (m) => this.sig?.send(m),
      onHealth: (h) => this.onHealth(link, h),
    });
    this.link = link;

    const control = link.pc.createDataChannel(CONTROL_LABEL, { ordered: true });
    control.onopen = () => {
      if (gen !== this.gen) return;
      this.sendControl({ type: "manifest", transferId: this.transferId, files: this.manifest });
    };
    control.onmessage = (e) => {
      if (gen !== this.gen) return;
      const msg = parseControl(e.data);
      if (msg) this.onControl(msg);
    };
    this.control = control;

    this.channels = Array.from({ length: DATA_CHANNELS }, (_, i) => {
      const ch = link.pc.createDataChannel(`${DATA_LABEL_PREFIX}${i}`, { ordered: true });
      ch.binaryType = "arraybuffer";
      ch.bufferedAmountLowThreshold = BUFFER_LOW;
      return ch;
    });

    link.start();
    this.setPhase(this.accepted ? "reconnecting" : "connecting");
  }

  private onHealth(link: PeerLink, health: PeerHealth) {
    if (link !== this.link || this.finished) return;
    if (health === "connected") {
      if (this.phase === "reconnecting" || this.phase === "connecting") {
        // Data resumes on its own after an ICE restart; after a fresh
        // connection we wait for the receiver's accept/resume message.
        this.setPhase(
          !this.accepted ? "awaiting-accept" : this.pumpDrained ? "finishing" : "transferring",
        );
      }
    } else if (health === "reconnecting") {
      this.setPhase("reconnecting", "Connection interrupted. Reconnecting…");
    } else if (health === "failed") {
      // ICE restarts didn't help: build a brand-new connection and resume.
      this.teardownLink();
      if (this.receiverPresent) {
        this.setPhase("reconnecting", "Connection lost. Retrying…");
        this.reconnectTimer = setTimeout(() => this.connect(), 1000);
      } else {
        this.setPhase(
          this.accepted ? "reconnecting" : "waiting",
          "Receiver went offline. Waiting for them to come back…",
        );
      }
    }
  }

  // ---- control channel ---------------------------------------------------

  private sendControl(msg: ControlMessage) {
    if (this.control?.readyState === "open") this.control.send(JSON.stringify(msg));
  }

  private onControl(msg: ControlMessage) {
    if (this.finished) return;
    switch (msg.type) {
      case "accept": {
        if (msg.transferId !== this.transferId) return;
        if (msg.offsets.length !== this.manifest.length) {
          this.fail("Receiver sent an invalid resume state.");
          return;
        }
        const offsets = msg.offsets.map((o, i) => Math.min(o, this.manifest[i].size));
        this.accepted = true;
        this.written = offsets.reduce((a, b) => a + b, 0);
        this.setPhase("transferring");
        this.startPump(offsets);
        break;
      }
      case "progress":
        this.written = Math.min(this.total, Math.max(this.written, msg.written));
        this.wake();
        this.emitter.push();
        break;
      case "file-done":
        if (msg.index < this.manifest.length) this.filesDone.add(msg.index);
        this.emitter.push();
        break;
      case "complete":
        this.written = this.total;
        this.finish("done");
        break;
      case "decline":
        this.finish("declined", "The receiver declined the transfer.");
        break;
      case "cancel":
        this.finish("cancelled", "The receiver cancelled the transfer.");
        break;
    }
  }

  // ---- data pump -----------------------------------------------------------

  private startPump(offsets: number[]) {
    const gen = this.gen;
    const pc = this.link!.pc;
    const jobs: Job[] = [];
    this.manifest.forEach((f, index) => {
      for (let start = offsets[index]; start < f.size; start += SLAB_SIZE) {
        jobs.push({ index, start, end: Math.min(f.size, start + SLAB_SIZE) });
      }
    });
    this.queued = this.written;
    this.pumpDrained = false;

    Promise.all(this.channels.map((ch) => this.pump(ch, jobs, gen, () => chunkSizeFor(pc))))
      .then(() => {
        // Everything is queued, but NOT yet received. Only the receiver's
        // "complete" ack moves us to "done".
        if (gen !== this.gen || jobs.length) return;
        this.pumpDrained = true;
        if (this.phase === "transferring") this.setPhase("finishing");
      })
      .catch((err) => {
        if (gen === this.gen) this.fail(err instanceof Error ? err.message : String(err));
      });
  }

  private async pump(ch: RTCDataChannel, jobs: Job[], gen: number, chunkSize: () => number) {
    const alive = () => gen === this.gen && !this.finished;
    if (!(await this.waitOpen(ch, alive))) return;
    const chunk = chunkSize();

    while (alive()) {
      // Flow control: don't race too far ahead of the receiver's disk.
      while (alive() && this.queued - this.written > FLOW_WINDOW) await this.sleep();
      const job = jobs.shift();
      if (!job || !alive()) return;

      const { file, path } = this.items[job.index];
      let slab: Uint8Array;
      try {
        slab = new Uint8Array(await file.slice(job.start, job.end).arrayBuffer());
      } catch {
        throw new Error(`Couldn't read "${path}". Was it moved or changed?`);
      }

      for (let off = 0; off < slab.byteLength; off += chunk) {
        while (alive() && ch.readyState === "open" && ch.bufferedAmount > BUFFER_HIGH) {
          await this.sleep(ch);
        }
        if (!alive() || ch.readyState !== "open") {
          // The link died mid-slab; the resume handshake re-sends from the
          // receiver's confirmed offsets, so nothing is lost.
          jobs.unshift({ ...job, start: job.start + off });
          return;
        }
        const part = slab.subarray(off, off + chunk);
        try {
          ch.send(encodeChunk(job.index, job.start + off, part));
        } catch {
          jobs.unshift({ ...job, start: job.start + off });
          return;
        }
        this.queued += part.byteLength;
      }
    }
  }

  private waitOpen(ch: RTCDataChannel, alive: () => boolean): Promise<boolean> {
    return new Promise((resolve) => {
      const check = () => {
        if (ch.readyState === "open") return resolve(true);
        if (!alive() || ch.readyState === "closed" || ch.readyState === "closing") {
          return resolve(false);
        }
        this.sleep(ch).then(check);
      };
      check();
    });
  }

  /** Resolves on: buffer drained / channel state change / receiver progress / teardown. */
  private sleep(ch?: RTCDataChannel): Promise<void> {
    return new Promise((resolve) => {
      const done = () => {
        this.wakers.delete(done);
        ch?.removeEventListener("bufferedamountlow", done);
        ch?.removeEventListener("open", done);
        ch?.removeEventListener("close", done);
        resolve();
      };
      this.wakers.add(done);
      ch?.addEventListener("bufferedamountlow", done);
      ch?.addEventListener("open", done);
      ch?.addEventListener("close", done);
    });
  }

  private wake() {
    for (const w of [...this.wakers]) w();
  }

  // ---- lifecycle -----------------------------------------------------------

  private setPhase(phase: SenderPhase, message?: string) {
    if (this.finished) return;
    this.phase = phase;
    this.message = message;
    this.emitter.flush();
  }

  private fail(message: string) {
    this.sendControl({ type: "cancel" });
    this.finish("error", message);
  }

  private finish(phase: SenderPhase, message?: string) {
    if (this.finished) return;
    this.phase = phase;
    this.message = message;
    this.emitter.flush();
    this.wake();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    // Give the last control message a moment to leave before closing.
    setTimeout(() => {
      this.teardownLink();
      this.sig?.close();
      this.sig = null;
    }, 500);
  }

  private teardownLink() {
    this.gen++;
    this.wake();
    this.channels.forEach((ch) => ch.close());
    this.channels = [];
    this.control?.close();
    this.control = null;
    this.link?.close();
    this.link = null;
  }
}
