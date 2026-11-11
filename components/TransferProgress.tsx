"use client";

import { formatBytes, formatDuration, formatSpeed } from "@/lib/format";

type Props = {
  done: number;
  total: number;
  /** Bytes per second; 0 hides speed and ETA. */
  speed: number;
};

export default function TransferProgress({ done, total, speed }: Props) {
  const percent = total > 0 ? Math.min(100, (done / total) * 100) : 100;
  const eta = speed > 0 && done < total ? (total - done) / speed : 0;
  const complete = percent >= 100;

  return (
    <div className="w-full">
      <div className="flex items-end justify-between gap-3">
        <span className="font-mono text-2xl font-medium tabular-nums tracking-tight text-fg">
          {percent.toFixed(0)}
          <span className="text-subtle">%</span>
        </span>
        <span className="pb-1 text-right font-mono text-xs tabular-nums text-muted">
          {speed > 0 ? formatSpeed(speed) : complete ? "Complete" : "Starting…"}
          {eta > 0 && <span className="text-subtle"> · {formatDuration(eta)} left</span>}
        </span>
      </div>
      <div
        className="mt-2 h-1 w-full overflow-hidden bg-surface-3"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percent)}
      >
        <div
          className={`h-full transition-[width] duration-200 ease-out ${
            complete ? "bg-ok" : "bg-fg"
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="mt-2 font-mono text-xs tabular-nums text-muted">
        {formatBytes(done)} <span className="text-subtle">of</span> {formatBytes(total)}
      </p>
    </div>
  );
}
