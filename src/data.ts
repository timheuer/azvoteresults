import type { Meta, Stored } from './types';
import type { WorkerOut } from './worker';

const DB = 'azresults';
const STORE = 'kv';
const KEY = 'stored';
export const REFRESH_MS = 60 * 60 * 1000;

const url = (p: string) => new URL(`data/${p}`, document.baseURI).toString();

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function loadStored(): Promise<Stored | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const q = db.transaction(STORE).objectStore(STORE).get(KEY);
      q.onsuccess = () => resolve((q.result as Stored) ?? null);
      q.onerror = () => reject(q.error);
    });
  } catch {
    return null;
  }
}

async function save(s: Stored): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(s, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* storage unavailable (private mode / quota): the app still works in memory */
  }
}

async function fetchMeta(): Promise<Meta | null> {
  try {
    const r = await fetch(`${url('meta.json')}?t=${Date.now()}`, { cache: 'no-store' });
    return r.ok ? ((await r.json()) as Meta) : null;
  } catch {
    return null;
  }
}

function download(onProgress: (loaded: number) => void): Promise<Stored['model']> {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<WorkerOut>) => {
      const m = e.data;
      if (m.type === 'progress') onProgress(m.loaded);
      else {
        w.terminate();
        if (m.type === 'done') resolve(m.model);
        else reject(new Error(m.message));
      }
    };
    w.onerror = (e) => {
      w.terminate();
      reject(new Error(e.message || 'Worker failed'));
    };
    w.postMessage({ url: `${url('export.json')}?t=${Date.now()}` });
  });
}

/**
 * Checks the tiny meta.json and only downloads the full export when it changed
 * (or when nothing is cached / forced).
 */
export async function refresh(
  current: Stored | null,
  force: boolean,
  onProgress: (loaded: number) => void,
): Promise<Stored> {
  const now = new Date().toISOString();
  const meta = await fetchMeta();
  if (current && !force && meta && meta.md5 === current.md5) {
    const s = { ...current, lastChecked: now };
    await save(s);
    return s;
  }
  const model = await download(onProgress);
  const s: Stored = { model, md5: meta?.md5 ?? null, lastChecked: now, fetchedAt: meta?.fetchedAt ?? now };
  await save(s);
  return s;
}
