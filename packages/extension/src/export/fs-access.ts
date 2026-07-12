/**
 * Tier-1 export: write the compiled skill straight into the user's skill
 * folder via the File System Access API, with the directory handle persisted
 * in IndexedDB so later exports skip the picker. `chrome.storage` can't hold
 * a live handle (it's structured-cloneable but not JSON-serializable);
 * IndexedDB is the one store that persists FileSystemHandle objects.
 */
import type { SkillDirectory } from "@skillwright/shared";

/** Chrome-only permission methods missing from the TS DOM lib. */
interface PermissionedHandle extends FileSystemDirectoryHandle {
  queryPermission(desc: { mode: "read" | "readwrite" }): Promise<PermissionState>;
  requestPermission(desc: { mode: "read" | "readwrite" }): Promise<PermissionState>;
}

export interface HandleStore {
  get(): Promise<FileSystemDirectoryHandle | undefined>;
  set(handle: FileSystemDirectoryHandle): Promise<void>;
}

const DB_NAME = "skillwright-export";
const STORE = "handles";
const KEY = "skill-folder";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function idbHandleStore(): HandleStore {
  return {
    async get() {
      const db = await openDb();
      try {
        const tx = db.transaction(STORE, "readonly");
        return (await idbRequest(tx.objectStore(STORE).get(KEY))) as FileSystemDirectoryHandle | undefined;
      } finally {
        db.close();
      }
    },
    async set(handle) {
      const db = await openDb();
      try {
        const tx = db.transaction(STORE, "readwrite");
        await idbRequest(tx.objectStore(STORE).put(handle, KEY));
      } finally {
        db.close();
      }
    },
  };
}

/**
 * Write every skill file under `skillwright/<slug>/…` inside the picked
 * directory, creating intermediate directories as needed.
 */
export async function saveSkillToFolder(
  skill: SkillDirectory,
  dirHandle: FileSystemDirectoryHandle,
): Promise<void> {
  for (const [path, content] of Object.entries(skill.files)) {
    const segments = ["skillwright", skill.slug, ...path.split("/")];
    const filename = segments.pop()!;
    let dir = dirHandle;
    for (const segment of segments) {
      dir = await dir.getDirectoryHandle(segment, { create: true });
    }
    const file = await dir.getFileHandle(filename, { create: true });
    const writable = await file.createWritable();
    await writable.write(content);
    await writable.close();
  }
}

function defaultPicker(): Promise<FileSystemDirectoryHandle> {
  // Not yet in the TS DOM lib for all targets; present in real Chrome.
  return (window as unknown as { showDirectoryPicker(o: { mode: string }): Promise<FileSystemDirectoryHandle> })
    .showDirectoryPicker({ mode: "readwrite" });
}

/**
 * Ask the user to pick the skill folder and persist the handle for next time.
 * Propagates `AbortError` (user cancelled the picker) — callers decide the
 * fallback.
 */
export async function pickAndPersistHandle(
  picker: () => Promise<FileSystemDirectoryHandle> = defaultPicker,
  store: HandleStore = idbHandleStore(),
): Promise<FileSystemDirectoryHandle> {
  const handle = await picker();
  await store.set(handle);
  return handle;
}

/**
 * Recover the persisted folder handle, re-requesting permission if the grant
 * lapsed (Chrome drops it across restarts). `undefined` means "no usable
 * handle" — never persisted, or the user denied the re-request — and the
 * caller should fall back to the picker.
 */
export async function restoreHandle(
  store: HandleStore = idbHandleStore(),
): Promise<FileSystemDirectoryHandle | undefined> {
  const handle = (await store.get()) as PermissionedHandle | undefined;
  if (!handle) return undefined;
  if ((await handle.queryPermission({ mode: "readwrite" })) === "granted") return handle;
  if ((await handle.requestPermission({ mode: "readwrite" })) === "granted") return handle;
  return undefined;
}
