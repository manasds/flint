"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import FileList from "@/components/FileList";
import StatusDot, { type Tone } from "@/components/StatusDot";
import TransferProgress from "@/components/TransferProgress";
import {
  Banner,
  btn,
  Card,
  CheckIcon,
  CopyIcon,
  FileIcon,
  FolderIcon,
  LinkIcon,
  QrIcon,
  UploadIcon,
} from "@/components/ui";
import { itemsFromDrop, itemsFromFileList, mergeItems, type SendItem } from "@/lib/files";
import { randomId } from "@/lib/protocol";
import { SenderSession, type SenderPhase, type SenderSnapshot } from "@/lib/sender";

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

  function addItems(incoming: SendItem[]) {
    if (incoming.length) setItems((cur) => mergeItems(cur, incoming));
  }

  function reset() {
    setRoomId(null);
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

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between gap-3">
        {/* The page's single H1 lives in app/page.tsx. */}
        <h2 className="text-sm font-medium text-fg">
          {!sharing
            ? "Send files"
            : showLink
              ? "Ready to share"
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
              <div className="flex gap-2">
                <button onClick={() => setItems([])} className={btn.ghost}>
                  Clear
                </button>
                <button onClick={startSharing} className={`${btn.primary} flex-1`}>
                  <LinkIcon className="size-4" />
                  Create share link
                </button>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {showLink && (
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
                  setRoomId(null);
                  setSnap(null);
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
