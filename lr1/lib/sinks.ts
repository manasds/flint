import { baseName, safePathSegments, type ManifestFile } from "./protocol";

/**
 * Where received bytes go. Writes are positional, so chunks may arrive in any
 * order and duplicates (after a resume) are harmless.
 *
 * - "folder": File System Access API; files land directly in a folder the user
 *   picked, with the sender's folder structure. Never held in RAM.
 * - "opfs":   Origin Private File System; streamed to disk inside the browser,
 *   then handed to the user as disk-backed download links.
 * - "memory": last-resort fallback for browsers without either API.
 */
export type SinkKind = "folder" | "opfs" | "memory";

export type SavedFile = { index: number; path: string; name: string; url?: string };

export interface Sink {
  readonly kind: SinkKind;
  write(index: number, offset: number, data: Uint8Array): Promise<void>;
  /** Flush and close one file. After this resolves the file is on disk. */
  finish(index: number): Promise<SavedFile>;
  /** Stop and remove partial output. */
  abort(): Promise<void>;
  /** Revoke any object URLs handed out. */
  dispose(): void;
}

type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: (opts?: {
    mode?: "read" | "readwrite";
    id?: string;
  }) => Promise<FileSystemDirectoryHandle>;
};

export function supportsFolderSave(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

function supportsOpfs(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.storage?.getDirectory &&
    typeof FileSystemFileHandle !== "undefined" &&
    "createWritable" in FileSystemFileHandle.prototype
  );
}

/** Must be called synchronously inside a user gesture (it may open a picker). */
export function pickFolder(): Promise<FileSystemDirectoryHandle> {
  const w = window as DirectoryPickerWindow;
  if (!w.showDirectoryPicker) return Promise.reject(new Error("Folder save not supported"));
  return w.showDirectoryPicker({ mode: "readwrite", id: "flint-receive" });
}

export async function createSink(
  files: ManifestFile[],
  transferId: string,
  folder?: FileSystemDirectoryHandle,
): Promise<Sink> {
  if (folder) return new HandleSink("folder", files, folder, folder, null);
  if (supportsOpfs()) {
    try {
      const root = await navigator.storage.getDirectory();
      await cleanupOldOpfs(root);
      const name = `${OPFS_PREFIX}${Date.now()}-${transferId}`;
      const dir = await root.getDirectoryHandle(name, { create: true });
      return new HandleSink("opfs", files, dir, root, name);
    } catch (err) {
      console.warn("[sink] OPFS unavailable, falling back to memory:", err);
    }
  }
  return new MemorySink(files);
}

const OPFS_PREFIX = "flint-";
const OPFS_MAX_AGE_MS = 6 * 60 * 60 * 1000;

/** Remove OPFS transfer folders left behind by earlier visits. */
async function cleanupOldOpfs(root: FileSystemDirectoryHandle) {
  const iter = (root as unknown as { keys(): AsyncIterable<string> }).keys?.();
  if (!iter) return;
  const stale: string[] = [];
  for await (const name of iter) {
    if (!name.startsWith(OPFS_PREFIX)) continue;
    const ts = Number(name.slice(OPFS_PREFIX.length).split("-")[0]);
    if (!ts || Date.now() - ts > OPFS_MAX_AGE_MS) stale.push(name);
  }
  await Promise.all(
    stale.map((n) => root.removeEntry(n, { recursive: true }).catch(() => {})),
  );
}

type OpenFile = {
  handle: FileSystemFileHandle;
  writable: FileSystemWritableFileStream;
  /** Serializes writes so they hit disk in submission order. */
  chain: Promise<void>;
  dir: FileSystemDirectoryHandle;
  name: string;
};

class HandleSink implements Sink {
  private open = new Map<number, Promise<OpenFile>>();
  private created: { dir: FileSystemDirectoryHandle; name: string }[] = [];
  private urls: string[] = [];
  private usedNames = new Set<string>();

  constructor(
    readonly kind: "folder" | "opfs",
    private files: ManifestFile[],
    private root: FileSystemDirectoryHandle,
    private cleanupParent: FileSystemDirectoryHandle,
    private cleanupName: string | null,
  ) {}

  private openFile(index: number): Promise<OpenFile> {
    let p = this.open.get(index);
    if (!p) {
      p = this.createFile(index);
      this.open.set(index, p);
    }
    return p;
  }

  private async createFile(index: number): Promise<OpenFile> {
    const segments = safePathSegments(this.files[index].path);
    let dir = this.root;
    for (const seg of segments.slice(0, -1)) {
      dir = await dir.getDirectoryHandle(seg, { create: true });
    }
    const name = await this.uniqueName(
      dir,
      segments.slice(0, -1).join("/"),
      segments[segments.length - 1],
    );
    const handle = await dir.getFileHandle(name, { create: true });
    this.created.push({ dir, name });
    const writable = await handle.createWritable({ keepExistingData: false });
    return { handle, writable, chain: Promise.resolve(), dir, name };
  }

  /** Never overwrite something already in the user's folder: "a.txt" → "a (1).txt". */
  private async uniqueName(dir: FileSystemDirectoryHandle, dirPath: string, name: string) {
    const dot = name.lastIndexOf(".");
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : "";
    for (let n = 0; n < 1000; n++) {
      const candidate = n === 0 ? name : `${stem} (${n})${ext}`;
      const key = `${dirPath}\u0000${candidate.toLowerCase()}`;
      if (this.usedNames.has(key)) continue;
      // Reserve before awaiting so concurrently opened files can't collide.
      this.usedNames.add(key);
      const exists = await dir
        .getFileHandle(candidate)
        .then(() => true)
        .catch(() => false);
      if (!exists) return candidate;
    }
    throw new Error(`Could not find a free name for ${name}`);
  }

  async write(index: number, offset: number, data: Uint8Array) {
    const f = await this.openFile(index);
    const run = f.chain.then(() =>
      f.writable.write({ type: "write", position: offset, data: data as Uint8Array<ArrayBuffer> }),
    );
    f.chain = run.catch(() => {});
    return run;
  }

  async finish(index: number): Promise<SavedFile> {
    const f = await this.openFile(index);
    await f.chain;
    await f.writable.close();
    const path = this.files[index].path;
    const saved: SavedFile = { index, path, name: f.name };
    if (this.kind === "opfs") {
      // getFile() returns a disk-backed File; the object URL does not copy it into RAM.
      const file = await f.handle.getFile();
      const blob = this.files[index].mime ? file.slice(0, file.size, this.files[index].mime) : file;
      saved.url = URL.createObjectURL(blob);
      saved.name = baseName(path);
      this.urls.push(saved.url);
    }
    return saved;
  }

  async abort() {
    const opened = await Promise.allSettled(this.open.values());
    await Promise.allSettled(
      opened.map((r) => (r.status === "fulfilled" ? r.value.writable.abort() : null)),
    );
    if (this.cleanupName) {
      await this.cleanupParent.removeEntry(this.cleanupName, { recursive: true }).catch(() => {});
    } else {
      // Folder mode: remove only the files we created, never anything else.
      await Promise.allSettled(this.created.map(({ dir, name }) => dir.removeEntry(name)));
    }
    this.dispose();
  }

  dispose() {
    this.urls.forEach((u) => URL.revokeObjectURL(u));
    this.urls = [];
  }
}

class MemorySink implements Sink {
  readonly kind = "memory" as const;
  private parts = new Map<number, Map<number, Uint8Array>>();
  private urls: string[] = [];

  constructor(private files: ManifestFile[]) {}

  async write(index: number, offset: number, data: Uint8Array) {
    let m = this.parts.get(index);
    if (!m) this.parts.set(index, (m = new Map()));
    m.set(offset, data);
  }

  async finish(index: number): Promise<SavedFile> {
    const m = this.parts.get(index) ?? new Map<number, Uint8Array>();
    const blobParts: Uint8Array<ArrayBuffer>[] = [];
    let pos = 0;
    for (const [offset, data] of [...m.entries()].sort((a, b) => a[0] - b[0])) {
      if (offset + data.byteLength <= pos) continue; // fully duplicated
      blobParts.push(data.subarray(Math.max(0, pos - offset)) as Uint8Array<ArrayBuffer>);
      pos = offset + data.byteLength;
    }
    this.parts.delete(index);
    const { path, mime } = this.files[index];
    const url = URL.createObjectURL(new Blob(blobParts, { type: mime }));
    this.urls.push(url);
    return { index, path, name: baseName(path), url };
  }

  async abort() {
    this.parts.clear();
    this.dispose();
  }

  dispose() {
    this.urls.forEach((u) => URL.revokeObjectURL(u));
    this.urls = [];
  }
}
