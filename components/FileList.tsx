"use client";

import { formatBytes } from "@/lib/format";
import { CheckIcon, DownloadIcon, FileIcon, XIcon } from "@/components/ui";

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

/** Splits "a/b/c.txt" into the folder part and the file name. */
function splitPath(path: string) {
  const i = path.lastIndexOf("/");
  return i < 0 ? { dir: "", name: path } : { dir: path.slice(0, i + 1), name: path.slice(i + 1) };
}

export default function FileList({ files, done, onRemove, links }: Props) {
  const total = files.reduce((sum, f) => sum + f.size, 0);
  const shown = files.slice(0, MAX_ROWS);

  return (
    <div className="overflow-hidden rounded-md border border-line">
      <div className="flex items-center justify-between border-b border-line px-3 py-2 text-xs text-muted">
        <span>
          {files.length} {files.length === 1 ? "file" : "files"}
          {done && done.size > 0 && (
            <span className="text-ok"> · {done.size} saved</span>
          )}
        </span>
        <span className="font-mono tabular-nums">{formatBytes(total)}</span>
      </div>
      <ul className="max-h-60 divide-y divide-line overflow-y-auto">
        {shown.map((f, i) => {
          const link = links?.get(i);
          const isDone = done?.has(i);
          const { dir, name } = splitPath(f.path);
          return (
            <li key={`${i}-${f.path}`} className="flex h-10 items-center gap-3 px-3 text-sm">
              <span
                className={`grid size-4 shrink-0 place-items-center ${
                  isDone ? "text-ok" : "text-subtle"
                }`}
              >
                {isDone ? (
                  <CheckIcon className="size-3.5" aria-label="done" />
                ) : (
                  <FileIcon className="size-3.5" />
                )}
              </span>
              <span className="min-w-0 flex-1 truncate" title={f.path}>
                {dir && <span className="text-subtle">{dir}</span>}
                <span className="text-fg">{name}</span>
              </span>
              <span className="shrink-0 font-mono text-xs tabular-nums text-muted">{formatBytes(f.size)}</span>
              {link && (
                <a
                  href={link.url}
                  download={link.name}
                  className="-mr-1 grid size-7 shrink-0 place-items-center rounded-md text-fg hover:bg-surface-2"
                  aria-label={`Save ${link.name}`}
                  title="Save"
                >
                  <DownloadIcon className="size-4" />
                </a>
              )}
              {onRemove && (
                <button
                  type="button"
                  onClick={() => onRemove(i)}
                  className="-mr-1 grid size-7 shrink-0 place-items-center rounded-md text-subtle hover:bg-surface-2 hover:text-fg"
                  aria-label={`Remove ${f.path}`}
                >
                  <XIcon className="size-4" />
                </button>
              )}
            </li>
          );
        })}
        {files.length > MAX_ROWS && (
          <li className="px-4 py-2.5 text-xs text-muted">…and {files.length - MAX_ROWS} more</li>
        )}
      </ul>
    </div>
  );
}
