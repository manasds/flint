"use client";

import { useEffect, useRef, useState } from "react";
import { formatBytes, formatSpeed } from "@/lib/format";

type Props = {
  sent: number;
  total: number;
};

export default function TransferProgress({ sent, total }: Props) {
  const [speed, setSpeed] = useState(0);
  const lastSample = useRef({ bytes: 0, time: Date.now() });

  useEffect(() => {
    const now = Date.now();
    const elapsed = (now - lastSample.current.time) / 1000;
    if (elapsed >= 0.3) {
      const delta = sent - lastSample.current.bytes;
      setSpeed(delta / elapsed);
      lastSample.current = { bytes: sent, time: now };
    }
  }, [sent]);

  const percent = total > 0 ? Math.min(100, (sent / total) * 100) : 0;

  return (
    <div className="w-full">
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        <div
          className="h-full rounded-full bg-indigo-500 transition-[width] duration-150 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
        <span>
          {formatBytes(sent)} / {formatBytes(total)}
        </span>
        <span>{percent.toFixed(0)}%</span>
        <span>{formatSpeed(speed)}</span>
      </div>
    </div>
  );
}
