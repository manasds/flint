"use client";

export type Tone = "idle" | "pending" | "ok" | "bad";

const DOT: Record<Tone, string> = {
  idle: "bg-subtle",
  pending: "bg-fg",
  ok: "bg-ok",
  bad: "bg-bad",
};

export default function StatusDot({ tone, label }: { tone: Tone; label: string }) {
  return (
    <div role="status" className="inline-flex shrink-0 items-center gap-2 text-xs text-muted">
      <span className={`size-1.5 rounded-full ${DOT[tone]} ${tone === "pending" ? "animate-pulse" : ""}`} />
      {label}
    </div>
  );
}
