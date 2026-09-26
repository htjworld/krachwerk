// 내 소리 저장(§15.4): IndexedDB `krachwerk-kit`에 브라우저 안에서만 남긴다. 실패하면(사파리
// 비공개 창 등) 메모리에만 두고 새로고침하면 사라진다 — 조용히 그렇게 동작해야 하므로 모든
// IndexedDB 접근을 try/catch로 감싼다.
import type { UserSlot } from "./userKit";

export interface UserKitFile {
  id: string;
  name: string;
  slot: UserSlot;
  data: ArrayBuffer;
  addedAt: number;
}

const DB_NAME = "krachwerk-kit";
const DB_VERSION = 1;
const STORE_NAME = "files";

// IndexedDB가 한 번이라도 실패하면(비공개 창 등) 이후로는 메모리로만 동작한다.
let memoryFallback: UserKitFile[] | null = null;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const store = db.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
        const request = run(store);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      })
  );
}

/** 저장이 실제로 남는지(false면 새로고침하면 사라진다는 안내를 보여줘야 한다). */
export function isPersistent(): boolean {
  return memoryFallback === null;
}

export async function listFiles(): Promise<UserKitFile[]> {
  if (memoryFallback) return memoryFallback;
  try {
    return await withStore<UserKitFile[]>("readonly", (store) => store.getAll());
  } catch {
    memoryFallback = [];
    return memoryFallback;
  }
}

export async function addFile(file: UserKitFile): Promise<void> {
  if (memoryFallback) {
    memoryFallback.push(file);
    return;
  }
  try {
    await withStore("readwrite", (store) => store.put(file));
  } catch {
    memoryFallback = [file];
  }
}

export async function removeFile(id: string): Promise<void> {
  if (memoryFallback) {
    memoryFallback = memoryFallback.filter((f) => f.id !== id);
    return;
  }
  try {
    await withStore("readwrite", (store) => store.delete(id));
  } catch {
    // 지우기 실패는 치명적이지 않다 — 조용히 넘어간다.
  }
}

export async function updateSlot(id: string, slot: UserSlot): Promise<void> {
  if (memoryFallback) {
    const file = memoryFallback.find((f) => f.id === id);
    if (file) file.slot = slot;
    return;
  }
  try {
    const files = await listFiles();
    const file = files.find((f) => f.id === id);
    if (file) await withStore("readwrite", (store) => store.put({ ...file, slot }));
  } catch {
    // 조용히 넘어간다.
  }
}

/** "기본 소리로" 버튼: 전부 지운다. */
export async function clearAll(): Promise<void> {
  if (memoryFallback) {
    memoryFallback = [];
    return;
  }
  try {
    await withStore("readwrite", (store) => store.clear());
  } catch {
    // 조용히 넘어간다.
  }
}
