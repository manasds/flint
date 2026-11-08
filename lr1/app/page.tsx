"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import FileList from "@/components/FileList";
import StatusDot, { type Tone } from "@/components/StatusDot";
import TransferProgress from "@/components/TransferProgress";
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

export default function Home() {
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
    QRCode.toDataURL(url, { width: 220, margin: 1 }).then(setQr).catch(() => {});
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

  return (
    <main className="flex flex-1 items-center justify-center bg-gradient-to-b from-zinc-50 to-zinc-100 p-4 sm:p-6 dark:from-zinc-950 dark:to-black">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Flint
          </h1>
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
              className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
                dragOver
                  ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30"
                  : "border-zinc-300 dark:border-zinc-700"
              }`}
            >
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Drop files or folders here
              </span>
              <div className="flex gap-2">
                <PickButton label="Choose files" onPick={addItems} />
                <PickButton label="Choose folder" directory onPick={addItems} />
              </div>
            </div>

            {items.length > 0 && (
              <>
                <FileList
                  files={items.map((i) => ({ path: i.path, size: i.file.size }))}
                  onRemove={(idx) => setItems((cur) => cur.filter((_, i) => i !== idx))}
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => setItems([])}
                    className="rounded-lg px-3 py-2.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    Clear
                  </button>
                  <button
                    onClick={startSharing}
                    className="flex-1 rounded-lg bg-indigo-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-600"
                  >
                    Create share link
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <FileList files={items.map((i) => ({ path: i.path, size: i.file.size }))} />

            {showLink && (
              <div className="flex flex-col items-center gap-4">
                {qr && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={qr} alt="QR code" className="rounded-lg bg-white p-2" width={180} height={180} />
                )}
                <div className="flex w-full items-center gap-2">
                  <input
                    readOnly
                    value={link}
                    className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                  />
                  <button
                    onClick={copyLink}
                    className="shrink-0 rounded-lg bg-indigo-500 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-indigo-600"
                  >
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
                <p className="text-center text-xs text-zinc-500">
                  Keep this tab open. Share the link; the receiver will see the file list and can
                  accept or decline.
                </p>
              </div>
            )}

            {phase === "awaiting-accept" && (
              <p className="text-center text-sm text-zinc-500">
                Receiver connected. Waiting for them to accept…
              </p>
            )}

            {showProgress && snap && (
              <div className="flex flex-col gap-2">
                <TransferProgress done={snap.written} total={snap.total} speed={snap.speed} />
                {snap.fileCount > 1 && (
                  <p className="text-xs text-zinc-500">
                    {snap.filesDone} of {snap.fileCount} files saved by receiver
                  </p>
                )}
              </div>
            )}

            {snap?.message && !final && (
              <p className="text-center text-xs text-amber-600 dark:text-amber-500">{snap.message}</p>
            )}
            {phase === "finishing" && (
              <p className="text-center text-xs text-zinc-500">
                All data sent. Waiting for the receiver to confirm it&apos;s saved. Keep this tab open.
              </p>
            )}
            {phase === "done" && (
              <p className="text-center text-sm font-medium text-green-600 dark:text-green-500">
                Delivered. The receiver confirmed {snap!.fileCount === 1 ? "the file is" : "all files are"} saved.
              </p>
            )}
            {(phase === "declined" || phase === "cancelled" || phase === "error") && (
              <p className="text-center text-sm font-medium text-red-600 dark:text-red-500">
                {snap?.message ?? "Transfer stopped."}
              </p>
            )}

            {final ? (
              <button
                onClick={reset}
                className="rounded-lg bg-indigo-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-600"
              >
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
                className="rounded-lg px-4 py-2.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

function PickButton({
  label,
  directory,
  onPick,
}: {
  label: string;
  directory?: boolean;
  onPick: (items: SendItem[]) => void;
}) {
  return (
    <label className="cursor-pointer rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:border-indigo-400 dark:border-zinc-600 dark:text-zinc-300">
      {label}
      <input
        type="file"
        multiple
        className="hidden"
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
