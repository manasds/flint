import type { SessionSignal, SignalMessage } from "./types";

function iceServers(): RTCIceServer[] {
  const raw = process.env.NEXT_PUBLIC_ICE_SERVERS;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return parsed as RTCIceServer[];
    } catch {
      console.warn("NEXT_PUBLIC_ICE_SERVERS is not valid JSON; using default STUN.");
    }
  }
  return [{ urls: "stun:stun.l.google.com:19302" }];
}

/** How long a `disconnected` connection may sit before we try an ICE restart. */
const DISCONNECT_GRACE_MS = 3_000;
/** Delay between ICE restart attempts. */
const RESTART_INTERVAL_MS = 5_000;
const MAX_ICE_RESTARTS = 3;
/** Answerer side: give up waiting for the offerer to recover after this long. */
const ANSWERER_GIVE_UP_MS = 25_000;

export type PeerHealth = "connecting" | "connected" | "reconnecting" | "failed";

type Options = {
  session: string;
  offerer: boolean;
  send: (msg: SignalMessage) => void;
  onHealth: (health: PeerHealth) => void;
};

/**
 * One RTCPeerConnection generation.
 *
 * - Signaling messages are applied strictly in order through a promise queue,
 *   so an ICE candidate can never race ahead of the description it belongs to.
 * - Remote candidates are buffered until setRemoteDescription has completed
 *   (and, during an ICE restart, until the new answer is applied).
 * - `disconnected` is treated as transient: after a grace period the offerer
 *   performs ICE restarts; only after those fail is the link reported `failed`.
 */
export class PeerLink {
  readonly pc: RTCPeerConnection;
  readonly session: string;
  private readonly opts: Options;
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private queue: Promise<void> = Promise.resolve();
  private health: PeerHealth = "connecting";
  private graceTimer: ReturnType<typeof setTimeout> | null = null;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private giveUpTimer: ReturnType<typeof setTimeout> | null = null;
  private restarts = 0;
  private closed = false;

  constructor(opts: Options) {
    this.opts = opts;
    this.session = opts.session;
    this.pc = new RTCPeerConnection({ iceServers: iceServers() });

    this.pc.onicecandidate = (event) => {
      if (event.candidate && !this.closed) {
        opts.send({
          type: "ice-candidate",
          candidate: event.candidate.toJSON(),
          session: this.session,
        });
      }
    };
    this.pc.onconnectionstatechange = () => this.onConnectionState();
  }

  /** Offerer only: create and send the initial offer. */
  start() {
    this.enqueue(() => this.sendOffer(false));
  }

  handleSignal(msg: SessionSignal) {
    if (msg.session !== this.session || this.closed) return;
    this.enqueue(() => this.apply(msg));
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.clearTimers();
    this.pc.onconnectionstatechange = null;
    this.pc.onicecandidate = null;
    this.pc.close();
  }

  private enqueue(task: () => Promise<void>) {
    this.queue = this.queue.then(task).catch((err) => {
      if (!this.closed) console.warn("[peer] signaling step failed:", err);
    });
  }

  private async apply(msg: SessionSignal) {
    const pc = this.pc;
    if (msg.type === "offer") {
      if (this.opts.offerer) return;
      await pc.setRemoteDescription(msg.sdp);
      await this.flushCandidates();
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.opts.send({ type: "answer", sdp: answer, session: this.session });
    } else if (msg.type === "answer") {
      if (!this.opts.offerer || pc.signalingState !== "have-local-offer") return;
      await pc.setRemoteDescription(msg.sdp);
      await this.flushCandidates();
    } else {
      // While our (re)start offer is outstanding the remote's new-generation
      // candidates can't be matched yet, so hold them until the answer lands.
      if (!pc.remoteDescription || pc.signalingState === "have-local-offer") {
        this.pendingCandidates.push(msg.candidate);
      } else {
        await this.addCandidate(msg.candidate);
      }
    }
  }

  private async flushCandidates() {
    const pending = this.pendingCandidates;
    this.pendingCandidates = [];
    for (const c of pending) await this.addCandidate(c);
  }

  private async addCandidate(candidate: RTCIceCandidateInit) {
    try {
      await this.pc.addIceCandidate(candidate);
    } catch (err) {
      // A single bad/stale candidate must not tear down the connection.
      console.warn("[peer] ignoring ICE candidate:", err);
    }
  }

  private async sendOffer(iceRestart: boolean) {
    if (this.closed) return;
    const offer = await this.pc.createOffer({ iceRestart });
    await this.pc.setLocalDescription(offer);
    this.opts.send({ type: "offer", sdp: offer, session: this.session });
  }

  private setHealth(health: PeerHealth) {
    if (this.health === health || this.closed) return;
    this.health = health;
    this.opts.onHealth(health);
  }

  private clearTimers() {
    for (const t of [this.graceTimer, this.restartTimer, this.giveUpTimer]) {
      if (t) clearTimeout(t);
    }
    this.graceTimer = this.restartTimer = this.giveUpTimer = null;
  }

  private onConnectionState() {
    const state = this.pc.connectionState;
    if (state === "connected") {
      this.clearTimers();
      this.restarts = 0;
      this.setHealth("connected");
      return;
    }
    if (state === "closed") {
      this.clearTimers();
      this.setHealth("failed");
      return;
    }
    if (state !== "disconnected" && state !== "failed") return;
    if (this.health === "connecting") {
      // Never connected in the first place.
      if (state === "failed") this.setHealth("failed");
      return;
    }

    this.setHealth("reconnecting");
    if (!this.opts.offerer) {
      // The offerer drives ICE restarts; we just wait for its new offer.
      this.giveUpTimer ??= setTimeout(() => this.setHealth("failed"), ANSWERER_GIVE_UP_MS);
      return;
    }
    if (state === "failed") {
      if (this.graceTimer) clearTimeout(this.graceTimer);
      this.graceTimer = null;
      if (!this.restartTimer) this.iceRestart();
    } else if (!this.graceTimer && !this.restartTimer) {
      this.graceTimer = setTimeout(() => {
        this.graceTimer = null;
        if (this.pc.connectionState !== "connected") this.iceRestart();
      }, DISCONNECT_GRACE_MS);
    }
  }

  private iceRestart() {
    if (this.closed) return;
    if (this.restarts >= MAX_ICE_RESTARTS) {
      this.clearTimers();
      this.setHealth("failed");
      return;
    }
    this.restarts++;
    console.info(`[peer] ICE restart attempt ${this.restarts}/${MAX_ICE_RESTARTS}`);
    this.enqueue(() => this.sendOffer(true));
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      if (this.pc.connectionState !== "connected") this.iceRestart();
    }, RESTART_INTERVAL_MS);
  }
}
