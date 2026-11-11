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

  return (
    <div className="w-full">
      <div
        className="h-2.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percent)}
      >
        <div
          className="h-full rounded-full bg-indigo-500 transition-[width] duration-200 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
        <span>
          {formatBytes(done)} / {formatBytes(total)}
        </span>
        <span>{percent.toFixed(0)}%</span>
        <span>
          {speed > 0 ? formatSpeed(speed) : "–"}
          {eta > 0 && ` · ${formatDuration(eta)} left`}
        </span>
      </div>
    </div>
  );
}
