"use client";

export type Tone = "idle" | "pending" | "ok" | "bad";

const COLOR: Record<Tone, string> = {
  idle: "bg-zinc-400",
  pending: "bg-amber-400",
  ok: "bg-green-500",
  bad: "bg-red-500",
};

export default function StatusDot({ tone, label }: { tone: Tone; label: string }) {
  const color = COLOR[tone];
  return (
    <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
      <span className="relative flex h-2.5 w-2.5">
        {tone === "pending" && (
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
