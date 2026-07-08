"use client";

export type ConnState = "idle" | "waiting" | "connecting" | "connected" | "done" | "error";

const CONFIG: Record<ConnState, { color: string; label: string; pulse: boolean }> = {
  idle: { color: "bg-zinc-400", label: "Idle", pulse: false },
  waiting: { color: "bg-amber-400", label: "Waiting for peer", pulse: true },
  connecting: { color: "bg-amber-400", label: "Connecting", pulse: true },
  connected: { color: "bg-green-500", label: "Connected", pulse: false },
  done: { color: "bg-green-500", label: "Done", pulse: false },
  error: { color: "bg-red-500", label: "Disconnected", pulse: false },
};

export default function StatusDot({ state }: { state: ConnState }) {
  const { color, label, pulse } = CONFIG[state];
  return (
    <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
      <span className="relative flex h-2.5 w-2.5">
        {pulse && (
          <span
            className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${color}`}
          />
        )}
        <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${color}`} />
      </span>
      {label}
    </div>
  );
}
