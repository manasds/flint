import { PeerLink, type PeerHealth } from "./peer";
import {
  CONTROL_LABEL,
  decodeChunk,
  parseControl,
  speedMeter,
  throttle,
  type ControlMessage,
  type ManifestFile,
} from "./protocol";
import { createSignaling, type Signaling } from "./signalling";
import { createSink, type SavedFile, type Sink, type SinkKind } from "./sinks";
import type { SignalMessage } from "./types";

export type ReceiverPhase =
  | "connecting"
  | "offer" // manifest received, waiting for the user to accept/decline
  | "transferring"
  | "reconnecting"
  | "done"
  | "declined"
  | "cancelled"
  | "error";

export type ReceiverSnapshot = {
  phase: ReceiverPhase;
  message?: string;
  files: ManifestFile[];
  total: number;
  written: number;
  speed: number;
  saved: SavedFile[];
  sinkKind: SinkKind | null;
};

type FileState = {
  /** Every byte in [0, contiguous) is written to the sink. Resume point. */
  contiguous: number;
  /** Written ranges beyond `contiguous` (from other channels), start → end. */
  ahead: Map<number, number>;
  finishing: boolean;
};

const FINAL_PHASES: ReceiverPhase[] = ["done", "declined", "cancelled", "error"];

export class ReceiverSession {
  private sig: Signaling | null = null;
  private link: PeerLink | null = null;
  private control: RTCDataChannel | null = null;
  private phase: ReceiverPhase = "connecting";
  private message: string | undefined;
  private transferId: string | null = null;
  private files: ManifestFile[] = [];
  private state: FileState[] = [];
  private total = 0;
  private written = 0;
  private accepted = false;
  private declined = false;
  /** Set while accept() awaits storage setup; blocks a second accept/decline. */
  private accepting = false;
  private sink: Sink | null = null;
  private saved: SavedFile[] = [];
  private readonly meter = speedMeter();
  private readonly emitter: ReturnType<typeof throttle<void>>;

  constructor(
    private readonly roomId: string,
    private readonly onChange: (snapshot: ReceiverSnapshot) => void,
  ) {
    // One 200 ms tick drives both the UI and the progress report to the sender.
    this.emitter = throttle<void>(() => {
      if (this.accepted && !this.finished) {
        this.sendControl({ type: "progress", written: this.written });
      }
      this.onChange({
        phase: this.phase,
        message: this.message,
        files: this.files,
        total: this.total,
        written: this.written,
        speed: this.phase === "transferring" ? this.meter(this.written) : 0,
        saved: this.saved,
        sinkKind: this.sink?.kind ?? null,
      });
    });
  }

  get finished() {
    return FINAL_PHASES.includes(this.phase);
  }

  get busy() {
    return this.accepted && !this.finished;
  }

  start() {
    this.sig = createSignaling(this.roomId, "receiver", (msg) => this.onSignal(msg));
    this.emitter.flush();
  }

  /** `folder` must come from pickFolder() called inside the click handler. */
  async accept(folder?: FileSystemDirectoryHandle) {
    if (this.phase !== "offer" || !this.transferId || this.accepting) return;
    this.accepting = true;
    try {
      this.sink = await createSink(this.files, this.transferId, folder);
    } catch (err) {
      this.fail(`Couldn't prepare storage: ${(err as Error).message}`);
      return;
    } finally {
      this.accepting = false;
    }
    if (this.finished) {
      void this.sink.abort();
      return;
    }
    this.accepted = true;
    this.setPhase("transferring");
    this.sendAccept();
    // Empty files carry no data; complete them right away.
    this.files.forEach((f, i) => {
      if (f.size === 0) void this.finishFile(i);
    });
  }

  decline() {
    if (this.phase !== "offer" || this.accepting) return;
    this.declined = true;
    this.sendControl({ type: "decline" });
    this.finish("declined", "You declined this transfer.");
  }

  cancel() {
    if (this.finished) return;
    this.sendControl({ type: "cancel" });
    void this.sink?.abort();
    this.finish("cancelled", "Transfer cancelled.");
  }

  dispose() {
    if (!this.finished) {
      this.phase = "cancelled";
      void this.sink?.abort();
    }
    this.sink?.dispose();
    this.emitter.cancel();
    this.teardownLink();
    this.sig?.close();
    this.sig = null;
  }

  // ---- signaling ---------------------------------------------------------

  private onSignal(msg: SignalMessage) {
    switch (msg.type) {
      case "offer":
        if (this.finished && this.phase !== "done") return;
        // A new session id means the sender built a fresh connection
        // (after a failed ICE restart or a reload of our signaling socket).
        if (!this.link || this.link.session !== msg.session) this.newLink(msg.session);
        this.link!.handleSignal(msg);
        break;
      case "answer":
      case "ice-candidate":
        this.link?.handleSignal(msg);
        break;
      case "peer-left":
        if (!this.finished && this.link?.pc.connectionState !== "connected") {
          this.setPhase("reconnecting", "The sender went offline. Waiting for them to come back…");
        }
        break;
      case "error":
        if (this.finished) return;
        this.finish(
          "error",
          msg.message === "Role taken"
            ? "Someone else has already opened this link."
            : msg.message,
        );
        break;
    }
  }

  private newLink(session: string) {
    this.teardownLink();
    const link = new PeerLink({
      session,
      offerer: false,
      send: (m) => this.sig?.send(m),
      onHealth: (h) => this.onHealth(link, h),
    });
    this.link = link;
    link.pc.ondatachannel = ({ channel }) => {
      if (this.link !== link) return channel.close();
      channel.binaryType = "arraybuffer";
      if (channel.label === CONTROL_LABEL) {
        this.control = channel;
        channel.onmessage = (e) => {
          if (this.link !== link) return;
          const msg = parseControl(e.data);
          if (msg) this.onControl(msg);
        };
      } else {
        channel.onmessage = (e) => {
          if (this.link === link && e.data instanceof ArrayBuffer) this.onData(e.data);
        };
      }
    };
    if (this.phase !== "offer" && !this.finished) {
      if (this.accepted) this.setPhase("reconnecting", "Reconnecting to sender…");
      else this.setPhase("connecting");
    }
  }

  private onHealth(link: PeerLink, health: PeerHealth) {
    if (link !== this.link || this.finished) return;
    if (health === "connected") {
      if (this.phase === "reconnecting") this.setPhase(this.accepted ? "transferring" : "connecting");
    } else if (health === "reconnecting") {
      if (this.phase !== "offer") this.setPhase("reconnecting", "Connection interrupted. Reconnecting…");
    } else if (health === "failed") {
      this.teardownLink();
      if (this.phase !== "offer") {
        this.setPhase(
          "reconnecting",
          "Connection lost. Keep this tab open. The transfer resumes when the sender reconnects.",
        );
      }
    }
  }

  // ---- control -----------------------------------------------------------

  private sendControl(msg: ControlMessage) {
    if (this.control?.readyState === "open") this.control.send(JSON.stringify(msg));
  }

  private sendAccept() {
    if (!this.transferId) return;
    this.sendControl({
      type: "accept",
      transferId: this.transferId,
      offsets: this.state.map((s) => s.contiguous),
    });
  }

  private onControl(msg: ControlMessage) {
    switch (msg.type) {
      case "manifest":
        if (msg.transferId === this.transferId) {
          // Sender reconnected with a fresh connection: resume where we are.
          if (this.phase === "done") this.sendControl({ type: "complete" });
          else if (this.declined) this.sendControl({ type: "decline" });
          else if (this.accepted && !this.finished) this.sendAccept();
          return;
        }
        if (this.accepted || this.finished) return; // one transfer per page
        this.transferId = msg.transferId;
        this.files = msg.files;
        this.total = msg.files.reduce((sum, f) => sum + f.size, 0);
        this.state = msg.files.map(() => ({ contiguous: 0, ahead: new Map(), finishing: false }));
        this.setPhase("offer");
        break;
      case "cancel":
        if (this.finished) return;
        void this.sink?.abort();
        this.finish("cancelled", "The sender cancelled the transfer.");
        break;
    }
  }

  // ---- data --------------------------------------------------------------

  private onData(buf: ArrayBuffer) {
    if (!this.accepted || this.finished || !this.sink) return;
    const chunk = decodeChunk(buf);
    if (!chunk) return;
    const { index, offset, data } = chunk;
    const file = this.files[index];
    const st = this.state[index];
    // Never trust the peer: drop anything outside the announced file bounds.
    if (!file || st.finishing || offset + data.byteLength > file.size) return;
    if (offset + data.byteLength <= st.contiguous) return; // duplicate after resume

    const end = offset + data.byteLength;
    this.sink.write(index, offset, data).then(
      () => this.onWritten(index, offset, end),
      (err: Error) => this.fail(`Couldn't write to disk: ${err.message}`),
    );
  }

  private onWritten(index: number, start: number, end: number) {
    if (this.finished) return;
    const st = this.state[index];
    const before = st.contiguous;
    if (start <= st.contiguous) st.contiguous = Math.max(st.contiguous, end);
    else st.ahead.set(start, Math.max(end, st.ahead.get(start) ?? 0));

    // Fold in ranges that are now adjacent to the contiguous prefix.
    let merged = true;
    while (merged && st.ahead.size) {
      merged = false;
      for (const [s, e] of st.ahead) {
        if (s <= st.contiguous) {
          st.contiguous = Math.max(st.contiguous, e);
          st.ahead.delete(s);
          merged = true;
        }
      }
    }

    this.written += st.contiguous - before;
    this.emitter.push();
    if (st.contiguous >= this.files[index].size) void this.finishFile(index);
  }

  private async finishFile(index: number) {
    const st = this.state[index];
    if (st.finishing || !this.sink) return;
    st.finishing = true;
    try {
      const saved = await this.sink.finish(index);
      if (this.finished) return;
      this.saved = [...this.saved, saved].sort((a, b) => a.index - b.index);
    } catch (err) {
      this.fail(`Couldn't save "${this.files[index].path}": ${(err as Error).message}`);
      return;
    }
    this.sendControl({ type: "file-done", index });
    if (this.saved.length === this.files.length) {
      // Every file is flushed and closed. Only now tell the sender it's done.
      this.emitter.flush();
      this.sendControl({ type: "complete" });
      this.finish("done");
    } else {
      this.emitter.push();
    }
  }

  // ---- lifecycle ---------------------------------------------------------

  private setPhase(phase: ReceiverPhase, message?: string) {
    if (this.finished) return;
    this.phase = phase;
    this.message = message;
    this.emitter.flush();
  }

  private fail(message: string) {
    if (this.finished) return;
    this.sendControl({ type: "cancel" });
    void this.sink?.abort();
    this.finish("error", message);
  }

  private finish(phase: ReceiverPhase, message?: string) {
    if (this.finished) return;
    this.phase = phase;
    this.message = message;
    this.emitter.flush();
    if (phase === "done") {
      // Stay reachable for a while: if our "complete" ack was lost, the
      // sender reconnects and we answer its manifest with "complete" again.
      setTimeout(() => {
        this.teardownLink();
        this.sig?.close();
        this.sig = null;
      }, 60_000);
    } else {
      setTimeout(() => {
        this.teardownLink();
        this.sig?.close();
        this.sig = null;
      }, 500);
    }
  }

  private teardownLink() {
    this.control?.close();
    this.control = null;
    this.link?.close();
    this.link = null;
  }
}
