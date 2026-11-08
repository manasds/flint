"use client";

import { formatBytes } from "@/lib/format";

type Row = { path: string; size: number };

type Props = {
  files: Row[];
  /** Indexes of files that are finished (shows a check mark). */
  done?: ReadonlySet<number>;
  /** Optional per-row action, e.g. remove from the selection. */
  onRemove?: (index: number) => void;
  /** Optional per-row download link (receiver, browser-storage mode). */
  links?: ReadonlyMap<number, { url: string; name: string }>;
};

const MAX_ROWS = 300;

export default function FileList({ files, done, onRemove, links }: Props) {
  const total = files.reduce((sum, f) => sum + f.size, 0);
  const shown = files.slice(0, MAX_ROWS);

  return (
    <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800/50">
      <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-2.5 text-xs text-zinc-500 dark:border-zinc-700/60">
        <span>
          {files.length} {files.length === 1 ? "file" : "files"}
        </span>
        <span>{formatBytes(total)}</span>
      </div>
      <ul className="max-h-56 overflow-y-auto py-1">
        {shown.map((f, i) => {
          const link = links?.get(i);
          return (
            <li key={`${i}-${f.path}`} className="flex items-center gap-3 px-4 py-1.5 text-sm">
              <span
                className={`w-4 shrink-0 text-center text-xs ${
                  done?.has(i) ? "text-green-600 dark:text-green-500" : "text-zinc-300 dark:text-zinc-600"
                }`}
                aria-label={done?.has(i) ? "done" : undefined}
              >
                {done?.has(i) ? "✓" : "•"}
              </span>
              <span
                className="min-w-0 flex-1 truncate text-zinc-800 dark:text-zinc-200"
                title={f.path}
              >
                {f.path}
              </span>
              <span className="shrink-0 text-xs tabular-nums text-zinc-500">
                {formatBytes(f.size)}
              </span>
              {link && (
                <a
                  href={link.url}
                  download={link.name}
                  className="shrink-0 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                >
                  Save
                </a>
              )}
              {onRemove && (
                <button
                  type="button"
                  onClick={() => onRemove(i)}
                  className="shrink-0 text-xs text-zinc-400 hover:text-red-500"
                  aria-label={`Remove ${f.path}`}
                >
                  ✕
                </button>
              )}
            </li>
          );
        })}
        {files.length > MAX_ROWS && (
          <li className="px-4 py-1.5 text-xs text-zinc-500">
            …and {files.length - MAX_ROWS} more
          </li>
        )}
      </ul>
    </div>
  );
}
