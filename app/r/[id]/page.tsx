"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { createSignaling } from "@/lib/signalling";
import { createReceiverConnection } from "@/lib/webrtc";
import type { FileMeta, SignalMessage } from "@/lib/types";
import TransferProgress from "@/components/TransferProgress";
import StatusDot, { type ConnState } from "@/components/StatusDot";
import { formatBytes } from "@/lib/format";

export default function ReceivePage() {
  const params = useParams<{ id: string }>();
  const roomId = params.id;

  const [state, setState] = useState<ConnState>("connecting");
  const [meta, setMeta] = useState<FileMeta | null>(null);
  const [received, setReceived] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState("");

  const connRef = useRef<ReturnType<typeof createReceiverConnection> | null>(null);

  useEffect(() => {
    if (!roomId) return;

    const sig = createSignaling(roomId, "receiver", (msg: SignalMessage) => {
      if (msg.type === "offer" || msg.type === "ice-candidate") {
        connRef.current?.handleSignal(msg);
      } else if (msg.type === "peer-left") {
        setState((prev) => (prev === "done" ? prev : "error"));
      } else if (msg.type === "error") {
        setState("error");
      }
    });

    const conn = createReceiverConnection(
      sig.send,
      (bytes) => {
        setReceived(bytes);
        setState((prev) => (prev === "done" ? prev : "connected"));
      },
      (blob, fileMeta) => {
        setMeta(fileMeta);
        setReceived(fileMeta.size);
        setDownloadUrl(URL.createObjectURL(blob));
        setState("done");
      },
      (fileMeta) => setMeta(fileMeta),
    );
    connRef.current = conn;

    conn.pc.onconnectionstatechange = () => {
      const s = conn.pc.connectionState;
      if (s === "failed" || s === "disconnected") {
        setState((prev) => (prev === "done" ? prev : "error"));
      }
    };

    return () => {
      sig.close();
      conn.pc.close();
      connRef.current = null;
    };
  }, [roomId]);

  return (
    <main className="flex flex-1 items-center justify-center bg-gradient-to-b from-zinc-50 to-zinc-100 p-6 dark:from-zinc-950 dark:to-black">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Flint
          </h1>
          <StatusDot state={state} />
        </div>

        {!meta && state !== "error" && (
          <p className="py-8 text-center text-sm text-zinc-500">
            Connecting to sender...
          </p>
        )}

        {meta && (
          <div className="flex flex-col gap-6">
            <div className="rounded-xl bg-zinc-50 p-4 dark:bg-zinc-800/50">
              <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {meta.name}
              </p>
              <p className="text-xs text-zinc-500">{formatBytes(meta.size)}</p>
            </div>

            <TransferProgress sent={received} total={meta.size} />

            {state === "done" && downloadUrl && (
              <a
                href={downloadUrl}
                download={meta.name}
                className="rounded-lg bg-indigo-500 px-4 py-2.5 text-center text-sm font-medium text-white transition-colors hover:bg-indigo-600"
              >
                Download {meta.name}
              </a>
            )}
          </div>
        )}

        {state === "error" && (
          <p className="mt-4 text-center text-sm font-medium text-red-600 dark:text-red-500">
            Connection lost or the sender is unavailable.
          </p>
        )}
      </div>
    </main>
  );
}
