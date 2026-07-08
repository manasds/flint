"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { createSignaling } from "@/lib/signalling";
import { createSenderConnection } from "@/lib/webrtc";
import type { SignalMessage } from "@/lib/types";
import TransferProgress from "@/components/TransferProgress";
import StatusDot, { type ConnState } from "@/components/StatusDot";
import { formatBytes } from "@/lib/format";

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [link, setLink] = useState("");
  const [qr, setQr] = useState("");
  const [state, setState] = useState<ConnState>("idle");
  const [sent, setSent] = useState(0);
  const [copied, setCopied] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const connRef = useRef<ReturnType<typeof createSenderConnection> | null>(null);

  useEffect(() => {
    if (!file) return;

    const id = crypto.randomUUID().slice(0, 8);
    const url = `${window.location.origin}/r/${id}`;
    setLink(url);
    QRCode.toDataURL(url, { width: 220, margin: 1 }).then(setQr).catch(() => {});
    setState("waiting");
    setSent(0);

    const sig = createSignaling(id, "sender", (msg: SignalMessage) => {
      if (msg.type === "peer-joined") {
        setState("connecting");
        const conn = createSenderConnection(file, sig.send, (bytes) => {
          setSent(bytes);
          if (bytes >= file.size) setState("done");
        });
        connRef.current = conn;
        conn.pc.onconnectionstatechange = () => {
          const s = conn.pc.connectionState;
          if (s === "connected") {
            setState((prev) => (prev === "done" ? prev : "connected"));
          } else if (s === "failed" || s === "disconnected") {
            setState("error");
          }
        };
      } else if (msg.type === "answer" || msg.type === "ice-candidate") {
        connRef.current?.handleSignal(msg);
      } else if (msg.type === "peer-left") {
        setState("error");
      }
    });

    return () => {
      sig.close();
      connRef.current?.pc.close();
      connRef.current = null;
    };
  }, [file]);

  function pickFile(f: File | null | undefined) {
    if (f) setFile(f);
  }

  async function copyLink() {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const showProgress = state === "connecting" || state === "connected" || state === "done";

  return (
    <main className="flex flex-1 items-center justify-center bg-gradient-to-b from-zinc-50 to-zinc-100 p-6 dark:from-zinc-950 dark:to-black">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Flint
          </h1>
          {state !== "idle" && <StatusDot state={state} />}
        </div>

        {!file ? (
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              pickFile(e.dataTransfer.files?.[0]);
            }}
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-10 text-center transition-colors ${
              dragOver
                ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30"
                : "border-zinc-300 hover:border-indigo-400 dark:border-zinc-700"
            }`}
          >
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Drop a file here
            </span>
            <span className="text-xs text-zinc-500 dark:text-zinc-500">or click to browse</span>
            <input
              type="file"
              className="hidden"
              onChange={(e) => pickFile(e.target.files?.[0])}
            />
          </label>
        ) : (
          <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between rounded-xl bg-zinc-50 p-4 dark:bg-zinc-800/50">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {file.name}
                </p>
                <p className="text-xs text-zinc-500">{formatBytes(file.size)}</p>
              </div>
            </div>

            {showProgress ? (
              <TransferProgress sent={sent} total={file.size} />
            ) : (
              <div className="flex flex-col items-center gap-4">
                {qr && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={qr}
                    alt="QR code"
                    className="rounded-lg bg-white p-2"
                    width={180}
                    height={180}
                  />
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
                  Keep this tab open. Share the link, and the file sends when they connect.
                </p>
              </div>
            )}

            {state === "done" && (
              <p className="text-center text-sm font-medium text-green-600 dark:text-green-500">
                File sent.
              </p>
            )}
            {state === "error" && (
              <p className="text-center text-sm font-medium text-red-600 dark:text-red-500">
                Connection lost.
              </p>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
