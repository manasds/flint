"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import FileList from "@/components/FileList";
import StatusDot, { type Tone } from "@/components/StatusDot";
import TransferProgress from "@/components/TransferProgress";
import { formatBytes } from "@/lib/format";
import { Banner, btn, Card, DownloadIcon, FolderIcon, SparkIcon } from "@/components/ui";
import { ReceiverSession, type ReceiverPhase, type ReceiverSnapshot } from "@/lib/receiver";
import { pickFolder, supportsFolderSave } from "@/lib/sinks";

const STATUS: Record<ReceiverPhase, { tone: Tone; label: string }> = {
  connecting: { tone: "pending", label: "Connecting" },
  offer: { tone: "pending", label: "Needs your OK" },
  transferring: { tone: "ok", label: "Receiving" },
  reconnecting: { tone: "pending", label: "Reconnecting" },
  done: { tone: "ok", label: "Done" },
  declined: { tone: "idle", label: "Declined" },
  cancelled: { tone: "idle", label: "Cancelled" },
  error: { tone: "bad", label: "Failed" },
};

export default function ReceivePage() {
  const { id: roomId } = useParams<{ id: string }>();
  const [snap, setSnap] = useState<ReceiverSnapshot | null>(null);
  const [canPickFolder, setCanPickFolder] = useState(false);
  const sessionRef = useRef<ReceiverSession | null>(null);

  useEffect(() => {
    if (!roomId) return;
    const session = new ReceiverSession(roomId, setSnap);
    sessionRef.current = session;
    session.start();
    return () => {
      session.dispose();
      sessionRef.current = null;
    };
  }, [roomId]);

  useEffect(() => {
    // Feature detection must wait for the client to avoid a hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCanPickFolder(supportsFolderSave());
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (sessionRef.current?.busy) e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  const phase = snap?.phase ?? "connecting";
  const files = useMemo(() => snap?.files ?? [], [snap?.files]);
  const doneSet = useMemo(() => new Set(snap?.saved.map((s) => s.index)), [snap?.saved]);
  const links = useMemo(
    () =>
      new Map(
        (snap?.saved ?? [])
          .filter((s) => s.url)
          .map((s) => [s.index, { url: s.url!, name: s.name }] as const),
      ),
    [snap?.saved],
  );
  const status = STATUS[phase];

  function saveToFolder() {
    // showDirectoryPicker needs the click's user activation: call it first.
    pickFolder()
      .then((dir) => sessionRef.current?.accept(dir))
      .catch((err: Error) => {
        if (err.name !== "AbortError") console.warn("Folder picker failed:", err);
      });
  }

  function downloadAll() {
    // Stagger clicks; browsers may ask once to allow multiple downloads.
    [...links.values()].forEach(({ url, name }, i) => {
      setTimeout(() => {
        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        a.click();
      }, i * 300);
    });
  }

  const showFiles = files.length > 0;
  const inProgress = phase === "transferring" || phase === "reconnecting";

  return (
    <main className="flex flex-1 items-start justify-center px-4 pt-10 pb-16 sm:items-center sm:px-6 sm:py-16">
      <Card>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h1 className="text-sm font-medium text-fg">
            {phase === "done" ? "Received" : "Incoming files"}
          </h1>
          <StatusDot tone={status.tone} label={status.label} />
        </div>

        {!showFiles && (phase === "connecting" || phase === "reconnecting") && (
          <div className="flex flex-col items-center gap-4 py-10 text-center">
            <SparkIcon className="size-5 animate-pulse text-fg" />
            <div>
              <p className="text-sm font-medium text-fg">Connecting to the sender…</p>
              <p className="mt-1 text-xs text-muted">This usually takes a second or two.</p>
            </div>
          </div>
        )}

        {showFiles && (
          <div className="flex flex-col gap-5">
            {phase === "offer" && (
              <div>
                <p className="text-xl font-semibold tracking-tight text-fg">
                  {files.length === 1 ? "1 file" : `${files.length} files`}
                  <span className="font-mono text-base font-normal text-muted"> · {formatBytes(snap!.total)}</span>
                </p>
                <p className="mt-1 text-sm text-muted">
                  Someone wants to send you {files.length === 1 ? "this file" : "these files"}.
                  Nothing downloads until you accept.
                </p>
              </div>
            )}

            {(inProgress || phase === "done") && snap && (
              <TransferProgress done={snap.written} total={snap.total} speed={snap.speed} />
            )}

            {phase === "done" && snap?.sinkKind === "folder" && (
              <Banner tone="ok" title="All saved">
                Saved to the folder you chose.
              </Banner>
            )}

            <FileList files={files} done={doneSet} links={links} />

            {phase === "offer" && (
              <div className="flex flex-col gap-2">
                {canPickFolder && (
                  <button onClick={saveToFolder} className={btn.primary}>
                    <FolderIcon className="size-4" />
                    Accept and save to folder…
                  </button>
                )}
                <button
                  onClick={() => sessionRef.current?.accept()}
                  className={canPickFolder ? btn.secondary : btn.primary}
                >
                  <DownloadIcon className="size-4" />
                  {canPickFolder ? "Accept, download in browser" : "Accept"}
                </button>
                <button onClick={() => sessionRef.current?.decline()} className={btn.ghost}>
                  Decline
                </button>
              </div>
            )}

            {inProgress && (
              <button onClick={() => sessionRef.current?.cancel()} className={btn.ghost}>
                Cancel transfer
              </button>
            )}

            {phase === "done" &&
              snap?.sinkKind !== "folder" &&
              (links.size > 1 ? (
                <button onClick={downloadAll} className={btn.primary}>
                  <DownloadIcon className="size-4" />
                  Save all {links.size} files
                </button>
              ) : (
                [...links.values()].map(({ url, name }) => (
                  <a key={url} href={url} download={name} className={`${btn.primary} min-w-0`}>
                    <DownloadIcon className="size-4 shrink-0" />
                    <span className="truncate">Save {name}</span>
                  </a>
                ))
              ))}
          </div>
        )}

        {snap?.message && (
          <div className="mt-4">
            <Banner
              tone={phase === "error" ? "bad" : phase === "reconnecting" ? "warn" : "info"}
              title={phase === "error" ? "Transfer failed" : undefined}
            >
              {snap.message}
            </Banner>
          </div>
        )}

        {(phase === "declined" || phase === "cancelled" || phase === "error") && (
          <Link href="/" className={`${btn.secondary} mt-4 w-full`}>
            Send your own files with Flint
          </Link>
        )}
      </Card>
    </main>
  );
}
