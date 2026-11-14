"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import FileList from "@/components/FileList";
import ReceiveFiles from "@/components/ReceiveFiles";
import StatusDot, { type Tone } from "@/components/StatusDot";
import TransferProgress from "@/components/TransferProgress";
import { useNearby } from "@/components/useNearby";
import {
  ArrowRightIcon,
  Banner,
  btn,
  Card,
  CheckIcon,
  CopyIcon,
  FileIcon,
  FolderIcon,
  LaptopIcon,
  LinkIcon,
  PhoneIcon,
  QrIcon,
  TabletIcon,
  UploadIcon,
} from "@/components/ui";
import { itemsFromDrop, itemsFromFileList, mergeItems, type SendItem } from "@/lib/files";
import { randomId } from "@/lib/protocol";
import type { ReceiverPhase } from "@/lib/receiver";
import { SenderSession, type SenderPhase, type SenderSnapshot } from "@/lib/sender";
import type { Device, DeviceKind } from "@/lib/types";

const STATUS: Record<SenderPhase, { tone: Tone; label: string }> = {
  waiting: { tone: "pending", label: "Waiting for receiver" },
  connecting: { tone: "pending", label: "Connecting" },
  "awaiting-accept": { tone: "pending", label: "Waiting for accept" },
  transferring: { tone: "ok", label: "Sending" },
  finishing: { tone: "pending", label: "Finishing" },
  reconnecting: { tone: "pending", label: "Reconnecting" },
  done: { tone: "ok", label: "Delivered" },
  declined: { tone: "bad", label: "Declined" },
  cancelled: { tone: "idle", label: "Cancelled" },
  error: { tone: "bad", label: "Failed" },
};

/** The interactive sender card, rendered inside the server-rendered landing page. */
export default function SendFiles() {
  const [items, setItems] = useState<SendItem[]>([]);
  /** Non-null while a share link is live. */
  const [roomId, setRoomId] = useState<string | null>(null);
  const sharing = roomId !== null;
  const [link, setLink] = useState("");
  const [qr, setQr] = useState("");
  const [snap, setSnap] = useState<SenderSnapshot | null>(null);
  const [copied, setCopied] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const sessionRef = useRef<SenderSession | null>(null);
  /** Nearby device we invited, when sending without a link. */
  const [target, setTarget] = useState<Device | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** An invite from a nearby device, shown in place of the send card. */
  const [incoming, setIncoming] = useState<{ from: Device; roomId: string } | null>(null);
  const receivePhaseRef = useRef<ReceiverPhase>("connecting");
  const onReceivePhase = useCallback((p: ReceiverPhase) => {
    receivePhaseRef.current = p;
  }, []);

  const nearby = useNearby({
    onInvite({ from, roomId: inviteRoom }) {
      if (incoming || roomId) {
        nearby.send({ type: "invite-busy", to: from.id, roomId: inviteRoom });
        return;
      }
      receivePhaseRef.current = "connecting";
      setIncoming({ from, roomId: inviteRoom });
    },
    onInviteCancel(from, inviteRoom) {
      const p = receivePhaseRef.current;
      if (incoming?.roomId === inviteRoom && (p === "connecting" || p === "offer")) {
        setIncoming(null);
      }
    },
    onInviteBusy(from, inviteRoom) {
      if (inviteRoom !== roomId || !target) return;
      setRoomId(null);
      setSnap(null);
      setTarget(null);
      setNotice(`${target.name} is busy with another transfer. Try again in a moment.`);
    },
  });
  const targetOnline = !target || nearby.peers.some((p) => p.id === target.id);

  useEffect(() => {
    if (!roomId || !items.length) return;
    const session = new SenderSession(items, roomId, setSnap);
    sessionRef.current = session;
    session.start();
    if (process.env.NODE_ENV !== "production") {
      // Dev-only handle for debugging/e2e tests (e.g. simulating a dropped link).
      (window as unknown as { __flintSender?: SenderSession }).__flintSender = session;
    }
    return () => {
      session.dispose();
      sessionRef.current = null;
    };
  }, [roomId, items]);

  function startSharing() {
    const id = randomId(10);
    const url = `${window.location.origin}/r/${id}`;
    setRoomId(id);
    setTarget(null);
    setNotice(null);
    setLink(url);
    setQr("");
    QRCode.toDataURL(url, { width: 312, margin: 0, color: { dark: "#1c1917", light: "#ffffff" } }).then(setQr).catch(() => {});
  }

  // Warn before closing the tab mid-transfer.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (sessionRef.current?.busy) e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  function sendTo(device: Device) {
    const id = randomId(10);
    setRoomId(id);
    setTarget(device);
    setNotice(null);
    setLink(`${window.location.origin}/r/${id}`);
    setQr("");
    nearby.send({
      type: "invite",
      to: device.id,
      roomId: id,
      count: items.length,
      total: items.reduce((sum, i) => sum + i.file.size, 0),
    });
  }

  function addItems(incoming: SendItem[]) {
    if (incoming.length) setItems((cur) => mergeItems(cur, incoming));
  }

  function reset() {
    setRoomId(null);
    setTarget(null);
    setItems([]);
    setSnap(null);
    setLink("");
    setQr("");
  }

  async function copyLink() {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const phase = snap?.phase;
  const showLink = sharing && (!phase || phase === "waiting" || phase === "connecting");
  const showProgress =
    phase === "transferring" || phase === "finishing" || phase === "reconnecting" || phase === "done";
  const final = phase === "done" || phase === "declined" || phase === "cancelled" || phase === "error";
  const status = phase ? STATUS[phase] : null;

  const fileRows = items.map((i) => ({ path: i.path, size: i.file.size }));

  if (incoming) {
    return (
      <ReceiveFiles
        key={incoming.roomId}
        roomId={incoming.roomId}
        from={incoming.from.name}
        onClose={() => setIncoming(null)}
        onPhase={onReceivePhase}
      />
    );
  }

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between gap-3">
        {/* The page's single H1 lives in app/page.tsx. */}
        <h2 className="text-sm font-medium text-fg">
          {!sharing
            ? "Send files"
            : showLink
              ? target
                ? "Sending nearby"
                : "Ready to share"
              : phase === "done"
                ? "Sent"
                : final
                  ? "Transfer ended"
                  : "Sending"}
        </h2>
        {sharing && status && <StatusDot tone={status.tone} label={status.label} />}
      </div>

      {!sharing ? (
        <div className="flex flex-col gap-4">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={(e) => {
              // dragleave also fires when moving onto a child element; ignore those.
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              itemsFromDrop(e.dataTransfer).then(addItems);
            }}
            className={`flex rounded-md border border-dashed transition-colors ${
              items.length
                ? "flex-row items-center gap-3 px-4 py-3 text-left"
                : "flex-col items-center justify-center gap-4 px-6 py-10 text-center"
            } ${
              dragOver
                ? "border-fg bg-surface-2"
                : "border-line-strong hover:border-subtle"
            }`}
          >
            <UploadIcon className={`shrink-0 text-subtle ${items.length ? "size-4" : "size-6"}`} />
            <div className={items.length ? "min-w-0 flex-1" : ""}>
              <p className="text-sm font-medium text-fg">
                {items.length ? "Add more" : "Drop files or folders here"}
              </p>
              <p className={`text-xs text-muted ${items.length ? "hidden sm:block" : "mt-1"}`}>
                {items.length ? "Drop here or browse" : "Any type, any size. Nothing is uploaded."}
              </p>
            </div>
            <div className={`flex gap-2 ${items.length ? "shrink-0" : "flex-wrap justify-center"}`}>
              <PickButton
                label={items.length ? "Files" : "Choose files"}
                icon={<FileIcon className="size-3.5" />}
                onPick={addItems}
              />
              <PickButton
                label={items.length ? "Folder" : "Choose folder"}
                icon={<FolderIcon className="size-3.5" />}
                directory
                onPick={addItems}
              />
            </div>
          </div>

          {items.length > 0 && (
            <>
              <FileList
                files={fileRows}
                onRemove={(idx) => setItems((cur) => cur.filter((_, i) => i !== idx))}
              />
              {nearby.online && (
                <NearbyList peers={nearby.peers} onPick={sendTo} />
              )}
              <div className="flex gap-2">
                <button onClick={() => setItems([])} className={btn.ghost}>
                  Clear
                </button>
                <button
                  onClick={startSharing}
                  className={`${nearby.peers.length ? btn.secondary : btn.primary} flex-1`}
                >
                  <LinkIcon className="size-4" />
                  Create share link
                </button>
              </div>
            </>
          )}

          {notice && <Banner tone="warn">{notice}</Banner>}

          {nearby.online && nearby.me && (
            <DeviceName name={nearby.me.name} onRename={nearby.rename} />
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {showLink && target && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col items-center gap-3 rounded-md border border-line p-6 text-center">
                <DeviceIcon kind={target.kind} className="size-8 text-fg" />
                <div>
                  <p className="text-sm font-medium text-fg">{target.name}</p>
                  <p className="mt-1 text-xs text-muted">
                    {phase === "connecting" ? "Connecting…" : "Waiting for it to open the request…"}
                  </p>
                </div>
              </div>
              {!targetOnline && phase === "waiting" && (
                <Banner tone="warn">
                  {target.name} went offline. Keep this tab open, or cancel and send another way.
                </Banner>
              )}
            </div>
          )}

          {showLink && !target && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col items-center gap-3 rounded-md border border-line p-5">
                <div className="grid size-[172px] place-items-center rounded bg-white p-2">
                  {qr ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={qr}
                      alt="QR code that opens this Flint share link on another device"
                      width={156}
                      height={156}
                    />
                  ) : (
                    <QrIcon className="size-10 text-zinc-300" />
                  )}
                </div>
                <p className="text-xs text-muted">Scan to open on another device</p>
              </div>
              <div className="flex items-center gap-1 rounded-md border border-line-strong bg-surface p-1 pl-3 focus-within:border-fg">
                <LinkIcon className="size-4 shrink-0 text-subtle" />
                <input
                  readOnly
                  value={link}
                  aria-label="Share link"
                  onFocus={(e) => e.currentTarget.select()}
                  className="min-w-0 flex-1 bg-transparent px-1 font-mono text-xs text-fg outline-none"
                />
                <button
                  onClick={copyLink}
                  className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded px-3 text-xs font-medium transition-colors ${
                    copied ? "text-ok" : "bg-ink text-on-ink hover:bg-ink-hover"
                  }`}
                >
                  {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
                  {copied ? "Copied" : "Copy link"}
                </button>
              </div>
              <p className="text-center text-xs leading-relaxed text-muted">
                Keep this tab open. The receiver sees the file list and chooses to accept or decline.
              </p>
            </div>
          )}

          {phase === "awaiting-accept" && (
            <Banner tone="info" title="Receiver connected">
              Waiting for them to accept the files…
            </Banner>
          )}

          {showProgress && snap && (
            <div className="flex flex-col gap-2">
              <TransferProgress done={snap.written} total={snap.total} speed={snap.speed} />
              {snap.fileCount > 1 && phase !== "done" && (
                <p className="text-xs text-muted">
                  {snap.filesDone} of {snap.fileCount} files saved by the receiver
                </p>
              )}
            </div>
          )}

          {snap?.message && !final && <Banner tone="warn">{snap.message}</Banner>}
          {phase === "finishing" && (
            <Banner tone="info">
              All data sent. Waiting for the receiver to confirm it&apos;s saved. Keep this tab open.
            </Banner>
          )}
          {phase === "done" && (
            <Banner tone="ok">
              The receiver confirmed {snap!.fileCount === 1 ? "the file is" : "all files are"} saved.
            </Banner>
          )}
          {(phase === "declined" || phase === "cancelled" || phase === "error") && (
            <Banner tone={phase === "cancelled" ? "info" : "bad"}>
              {snap?.message ?? "Transfer stopped."}
            </Banner>
          )}

          <FileList files={fileRows} done={phase === "done" ? allDone(fileRows.length) : undefined} />

          {final ? (
            <button onClick={reset} className={btn.primary}>
              Send more files
            </button>
          ) : (
            <button
              onClick={() => {
                if (phase && phase !== "waiting") {
                  sessionRef.current?.cancel();
                } else {
                  // Nobody connected yet: just go back to editing the selection.
                  if (target && roomId) {
                    nearby.send({ type: "invite-cancel", to: target.id, roomId });
                  }
                  setRoomId(null);
                  setSnap(null);
                  setTarget(null);
                }
              }}
              className={btn.ghost}
            >
              Cancel
            </button>
          )}
        </div>
      )}
    </Card>
  );
}

function allDone(n: number): ReadonlySet<number> {
  return new Set(Array.from({ length: n }, (_, i) => i));
}

function PickButton({
  label,
  icon,
  directory,
  onPick,
}: {
  label: string;
  icon: React.ReactNode;
  directory?: boolean;
  onPick: (items: SendItem[]) => void;
}) {
  return (
    <label className={`${btn.small} focus-within:outline-2 focus-within:outline-fg`}>
      {icon}
      {label}
      <input
        type="file"
        multiple
        className="sr-only"
        ref={(el) => {
          if (el && directory) el.setAttribute("webkitdirectory", "");
        }}
        onChange={(e) => {
          onPick(itemsFromFileList(e.target.files));
          e.target.value = "";
        }}
      />
    </label>
  );
}

function DeviceIcon({ kind, className }: { kind: DeviceKind; className?: string }) {
  const Icon = kind === "phone" ? PhoneIcon : kind === "tablet" ? TabletIcon : LaptopIcon;
  return <Icon className={className} />;
}

function NearbyList({ peers, onPick }: { peers: Device[]; onPick: (d: Device) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium text-muted">Send to a nearby device</p>
      {peers.length ? (
        <ul className="flex flex-col gap-1.5">
          {peers.map((p) => (
            <li key={p.id}>
              <button
                onClick={() => onPick(p)}
                className="group flex w-full items-center gap-3 rounded-md border border-line-strong bg-surface px-3 py-2.5 text-left transition-colors hover:border-fg hover:bg-surface-2"
              >
                <DeviceIcon kind={p.kind} className="size-4 shrink-0 text-subtle group-hover:text-fg" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{p.name}</span>
                <ArrowRightIcon className="size-4 shrink-0 text-subtle group-hover:text-fg" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-md border border-dashed border-line px-3 py-3 text-xs leading-relaxed text-muted">
          No other devices yet. Open Flint on a device on the same Wi-Fi and it shows up here.
        </p>
      )}
    </div>
  );
}

function DeviceName({ name, onRename }: { name: string; onRename: (name: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);

  function commit() {
    setEditing(false);
    if (draft.trim() && draft.trim() !== name) onRename(draft);
    else setDraft(name);
  }

  return (
    <div className="flex min-h-7 items-center justify-center gap-1.5 text-xs text-muted">
      <span className="size-1.5 shrink-0 rounded-full bg-ok" aria-hidden="true" />
      {editing ? (
        <form
          className="flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            commit();
          }}
        >
          <label htmlFor="flint-device-name">Visible as</label>
          <input
            id="flint-device-name"
            autoFocus
            value={draft}
            maxLength={40}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setDraft(name);
                setEditing(false);
              }
            }}
            className="h-7 w-44 rounded border border-line-strong bg-surface px-2 text-xs text-fg outline-none focus:border-fg"
          />
        </form>
      ) : (
        <>
          <span>
            Visible nearby as <span className="font-medium text-fg">{name}</span>
          </span>
          <button
            onClick={() => {
              setDraft(name);
              setEditing(true);
            }}
            className="rounded px-1 underline-offset-2 hover:text-fg hover:underline"
          >
            Rename
          </button>
        </>
      )}
    </div>
  );
}
