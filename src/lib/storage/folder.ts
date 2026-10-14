import { mergeData } from "../merge";
import { emptyData, type AppData } from "../types";
import type { StorageAdapter } from "./index";

/**
 * "Use on this computer only": the browser saves your data as a file in a folder you pick
 * (File System Access API, Edge and Chrome on desktop). Nothing goes to the server.
 *
 * Syncing between computers works by picking a folder that OneDrive, Google Drive or Dropbox
 * already syncs. Two computers may both change the file, so every save first re-reads it and,
 * if it changed since we last saw it, combines the two versions (same merge as the cloud mode).
 * Sync apps sometimes keep both versions as "conflicted copy" files; those are merged in too.
 */

export const DATA_FILE = "tempo-data.json";
const MODE_KEY = "tempo:mode";
const KEEP_BACKUPS = 14;

// ---- minimal typings for the parts of the API that TypeScript doesn't ship yet ------------

type PermissionMode = { mode: "readwrite" };
interface DirHandle extends FileSystemDirectoryHandle {
  queryPermission(d: PermissionMode): Promise<PermissionState>;
  requestPermission(d: PermissionMode): Promise<PermissionState>;
  values(): AsyncIterableIterator<FileSystemHandle>;
}
declare global {
  interface Window {
    showDirectoryPicker?: (opts?: { id?: string; mode?: "readwrite"; startIn?: string }) => Promise<FileSystemDirectoryHandle>;
  }
}

export const folderSupported = () => typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";

// ---- remembering the chosen folder between visits (IndexedDB can store folder handles) -----

function idb<T>(fn: (store: IDBObjectStore) => IDBRequest<T>, write = false): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("tempo", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("handles");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction("handles", write ? "readwrite" : "readonly");
      const req = fn(tx.objectStore("handles"));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    };
  });
}
const getSavedFolder = () => idb<DirHandle | undefined>((s) => s.get("folder") as IDBRequest<DirHandle | undefined>).catch(() => undefined);
const saveFolder = (h: FileSystemDirectoryHandle) => idb((s) => s.put(h, "folder"), true);

export function folderModeOn(): boolean {
  try {
    return localStorage.getItem(MODE_KEY) === "folder";
  } catch {
    return false;
  }
}

/** Leave folder mode (the files stay where they are). */
export function leaveFolderMode() {
  try {
    localStorage.removeItem(MODE_KEY);
  } catch {}
}

/**
 * Ask the user to pick a folder (must be called from a click). If the folder has no Tempo file
 * yet and `seed` is given, that data is written into it, so switching modes keeps your time.
 * Returns an error message, or null on success.
 */
export async function chooseFolder(seed?: AppData): Promise<string | null> {
  if (!folderSupported()) return "This browser can't save to a folder. Use Edge or Chrome on a computer.";
  let dir: FileSystemDirectoryHandle;
  try {
    dir = await window.showDirectoryPicker!({ id: "tempo", mode: "readwrite", startIn: "documents" });
  } catch {
    return "No folder chosen."; // the user closed the picker
  }
  try {
    if (seed && !(await readJson(dir, DATA_FILE))) await writeJson(dir, DATA_FILE, seed);
    await saveFolder(dir);
    localStorage.setItem(MODE_KEY, "folder");
    return null;
  } catch (err) {
    return `Could not use that folder: ${(err as Error).message}`;
  }
}

export type FolderStatus =
  | { status: "ready"; adapter: StorageAdapter }
  | { status: "reconnect"; name: string; reconnect: () => Promise<boolean> }
  | { status: "missing" };

/**
 * Find the folder chosen on an earlier visit. Browsers forget the permission when they restart,
 * and asking again needs a click, so we may have to show a "Reconnect" button first.
 */
export async function openSavedFolder(): Promise<FolderStatus> {
  const dir = await getSavedFolder();
  if (!dir) return { status: "missing" };
  if ((await dir.queryPermission({ mode: "readwrite" })) === "granted") return { status: "ready", adapter: folderAdapter(dir) };
  return {
    status: "reconnect",
    name: dir.name,
    reconnect: async () => (await dir.requestPermission({ mode: "readwrite" })) === "granted",
  };
}

// ---- reading and writing files -----------------------------------------------------------

async function readJson(dir: FileSystemDirectoryHandle, name: string): Promise<AppData | null> {
  try {
    const file = await (await dir.getFileHandle(name)).getFile();
    const parsed = JSON.parse(await file.text()) as AppData;
    return Array.isArray(parsed.projects) && Array.isArray(parsed.entries) ? parsed : null;
  } catch {
    return null; // missing, half-synced or not a Tempo file
  }
}

async function writeJson(dir: FileSystemDirectoryHandle, name: string, data: unknown) {
  const handle = await dir.getFileHandle(name, { create: true });
  // The browser writes to a temporary copy and swaps it in on close, so a crash never leaves half a file.
  const w = await handle.createWritable();
  await w.write(JSON.stringify(data, null, 2));
  await w.close();
}

/** Copies a sync app made when both computers changed the file at once, e.g. "tempo-data (conflicted copy).json". */
async function conflictCopies(dir: DirHandle): Promise<string[]> {
  const names: string[] = [];
  for await (const h of dir.values())
    if (h.kind === "file" && h.name !== DATA_FILE && /^tempo-data.*\.json$/i.test(h.name)) names.push(h.name);
  return names;
}

const today = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

function folderAdapter(dir: DirHandle): StorageAdapter {
  let base: string | null = null; // updatedAt of the version this window last read or wrote
  let backedUp: string | null = null;

  /** Main file plus any conflict copies, combined. Conflict copies are removed once merged. */
  const readAll = async (): Promise<{ data: AppData | null; copies: string[] }> => {
    let data = await readJson(dir, DATA_FILE);
    const copies = await conflictCopies(dir).catch(() => []);
    for (const name of copies) {
      const other = await readJson(dir, name);
      if (other) data = data ? mergeData(data, other) : other;
    }
    return { data, copies };
  };

  const cleanUp = async (copies: string[]) => {
    for (const name of copies) await dir.removeEntry(name).catch(() => {});
  };

  /** Once a day, keep a copy in backups/ (synced like everything else). The newest 14 stay. */
  const dailyBackup = async (current: AppData | null) => {
    const day = today();
    if (!current || backedUp === day) return;
    const backups = await dir.getDirectoryHandle("backups", { create: true });
    const name = `tempo-data-${day}.json`;
    try {
      await backups.getFileHandle(name);
    } catch {
      await writeJson(backups, name, current);
    }
    backedUp = day;
    const all: string[] = [];
    for await (const h of (backups as DirHandle).values()) if (/^tempo-data-\d{4}-\d{2}-\d{2}\.json$/.test(h.name)) all.push(h.name);
    all.sort();
    for (const old of all.slice(0, Math.max(0, all.length - KEEP_BACKUPS))) await backups.removeEntry(old).catch(() => {});
    adapter.backups = all.slice(-KEEP_BACKUPS).reverse().map((n) => n.slice(11, 21));
  };

  const listBackups = async () => {
    try {
      const backups = (await dir.getDirectoryHandle("backups")) as DirHandle;
      const days: string[] = [];
      for await (const h of backups.values()) {
        const m = /^tempo-data-(\d{4}-\d{2}-\d{2})\.json$/.exec(h.name);
        if (m) days.push(m[1]);
      }
      return days.sort().reverse();
    } catch {
      return [];
    }
  };

  const adapter: StorageAdapter = {
    kind: "folder",
    label: `Folder on this computer: ${dir.name}`,
    folderName: dir.name,
    async load() {
      const { data, copies } = await readAll();
      adapter.backups = await listBackups();
      if (copies.length && data) {
        await writeJson(dir, DATA_FILE, data);
        await cleanUp(copies);
      }
      base = data?.updatedAt ?? null;
      return data ?? emptyData();
    },
    async save(next) {
      const { data: stored, copies } = await readAll();
      await dailyBackup(stored).catch(() => {}); // a failed backup must never block saving
      // Another computer (through OneDrive etc.) or another tab changed the file: combine, don't overwrite.
      const merged = stored && (stored.updatedAt !== base || copies.length) ? mergeData(stored, next) : null;
      const toWrite = merged ?? next;
      await writeJson(dir, DATA_FILE, toWrite);
      await cleanUp(copies);
      base = toWrite.updatedAt;
      return merged;
    },
  };
  return adapter;
}
