import { MAX_FILES } from "./protocol";

export type SendItem = { file: File; path: string };

/** From <input type="file" multiple> or <input webkitdirectory>. */
export function itemsFromFileList(list: FileList | null | undefined): SendItem[] {
  if (!list) return [];
  return Array.from(list, (file) => ({
    file,
    path: file.webkitRelativePath || file.name,
  }));
}

/**
 * From a drop event. Must be called synchronously inside the drop handler:
 * DataTransfer items become inaccessible once the handler returns, so the
 * entries are captured first and walked asynchronously afterwards.
 */
export function itemsFromDrop(dt: DataTransfer): Promise<SendItem[]> {
  const entries = Array.from(dt.items ?? [])
    .filter((i) => i.kind === "file")
    .map((i) => i.webkitGetAsEntry?.())
    .filter((e): e is FileSystemEntry => !!e);
  if (!entries.length) return Promise.resolve(itemsFromFileList(dt.files));
  return walkEntries(entries);
}

async function walkEntries(roots: FileSystemEntry[]): Promise<SendItem[]> {
  const out: SendItem[] = [];
  const stack = [...roots];
  while (stack.length && out.length < MAX_FILES) {
    const entry = stack.pop()!;
    if (entry.isFile) {
      const file = await new Promise<File>((res, rej) =>
        (entry as FileSystemFileEntry).file(res, rej),
      ).catch(() => null);
      if (file) out.push({ file, path: entry.fullPath.replace(/^\/+/, "") || file.name });
    } else if (entry.isDirectory) {
      stack.push(...(await readAllEntries(entry as FileSystemDirectoryEntry)));
    }
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/** readEntries() returns results in batches; keep calling until it's empty. */
async function readAllEntries(dir: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
  const reader = dir.createReader();
  const all: FileSystemEntry[] = [];
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((res, rej) =>
      reader.readEntries(res, rej),
    ).catch(() => [] as FileSystemEntry[]);
    if (!batch.length) return all;
    all.push(...batch);
  }
}

/** Merge new picks into an existing selection, dropping exact path duplicates. */
export function mergeItems(current: SendItem[], incoming: SendItem[]): SendItem[] {
  const seen = new Set(current.map((i) => i.path));
  const merged = [...current];
  for (const item of incoming) {
    if (seen.has(item.path) || merged.length >= MAX_FILES) continue;
    seen.add(item.path);
    merged.push(item);
  }
  return merged;
}
