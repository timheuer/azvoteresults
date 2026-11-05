import { reduceExport } from './reduce';

export type WorkerIn = { url: string };
export type WorkerOut =
  | { type: 'progress'; loaded: number; total: number }
  | { type: 'done'; model: ReturnType<typeof reduceExport> }
  | { type: 'error'; message: string };

self.onmessage = async (e: MessageEvent<WorkerIn>) => {
  try {
    const res = await fetch(e.data.url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Data request failed (${res.status})`);
    const total = Number(res.headers.get('content-length')) || 0;
    const reader = res.body!.getReader();
    const chunks: Uint8Array[] = [];
    let loaded = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.length;
      (self as unknown as Worker).postMessage({ type: 'progress', loaded, total } satisfies WorkerOut);
    }
    const text = await new Blob(chunks as BlobPart[]).text();
    const model = reduceExport(JSON.parse(text));
    (self as unknown as Worker).postMessage({ type: 'done', model } satisfies WorkerOut);
  } catch (err) {
    (self as unknown as Worker).postMessage({ type: 'error', message: String((err as Error).message ?? err) } satisfies WorkerOut);
  }
};
