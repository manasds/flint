"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import FileList from "@/components/FileList";
import StatusDot, { type Tone } from "@/components/StatusDot";
import TransferProgress from "@/components/TransferProgress";
import { formatBytes } from "@/lib/format";
import { ReceiverSession, type ReceiverPhase, type ReceiverSnapshot } from "@/lib/receiver";
import { pickFolder, supportsFolderSave } from "@/lib/sinks";

const STATUS: Record<ReceiverPhase, { tone: Tone; label: string }> = {
  connecting: { tone: "pending", label: "Connecting" },
  offer: { tone: "pending", label: "Incoming files" },
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
    <main className="flex flex-1 items-center justify-center bg-gradient-to-b from-zinc-50 to-zinc-100 p-4 sm:p-6 dark:from-zinc-950 dark:to-black">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Flint
          </h1>
          <StatusDot tone={status.tone} label={status.label} />
        </div>

        {!showFiles && (phase === "connecting" || phase === "reconnecting") && (
          <p className="py-8 text-center text-sm text-zinc-500">Connecting to sender…</p>
        )}

        {showFiles && (
          <div className="flex flex-col gap-6">
            {phase === "offer" && (
              <p className="text-sm text-zinc-700 dark:text-zinc-300">
                Someone wants to send you {files.length === 1 ? "a file" : `${files.length} files`} (
                {formatBytes(snap!.total)}). Nothing is downloaded until you accept.
              </p>
            )}

            <FileList files={files} done={doneSet} links={links} />

            {phase === "offer" && (
              <div className="flex flex-col gap-2">
                {canPickFolder && (
                  <button
                    onClick={saveToFolder}
                    className="rounded-lg bg-indigo-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-600"
                  >
                    Accept and save to folder…
                  </button>
                )}
                <button
                  onClick={() => sessionRef.current?.accept()}
                  className={
                    canPickFolder
                      ? "rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
                      : "rounded-lg bg-indigo-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-600"
                  }
                >
                  {canPickFolder ? "Accept (download in browser)" : "Accept"}
                </button>
                <button
                  onClick={() => sessionRef.current?.decline()}
                  className="rounded-lg px-4 py-2.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  Decline
                </button>
              </div>
            )}

            {(inProgress || phase === "done") && snap && (
              <TransferProgress done={snap.written} total={snap.total} speed={snap.speed} />
            )}

            {inProgress && (
              <button
                onClick={() => sessionRef.current?.cancel()}
                className="rounded-lg px-4 py-2.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Cancel transfer
              </button>
            )}

            {phase === "done" &&
              (snap?.sinkKind === "folder" ? (
                <p className="text-center text-sm font-medium text-green-600 dark:text-green-500">
                  Saved to the folder you chose.
                </p>
              ) : links.size > 1 ? (
                <button
                  onClick={downloadAll}
                  className="rounded-lg bg-indigo-500 px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-indigo-600"
                >
                  Save all {links.size} files
                </button>
              ) : (
                [...links.values()].map(({ url, name }) => (
                  <a
                    key={url}
                    href={url}
                    download={name}
                    className="rounded-lg bg-indigo-500 px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-indigo-600"
                  >
                    Save {name}
                  </a>
                ))
              ))}
          </div>
        )}

        {snap?.message && (
          <p
            className={`mt-4 text-center text-sm ${
              phase === "error"
                ? "font-medium text-red-600 dark:text-red-500"
                : phase === "reconnecting"
                  ? "text-amber-600 dark:text-amber-500"
                  : "text-zinc-500"
            }`}
          >
            {snap.message}
          </p>
        )}
      </div>
    </main>
  );
}
