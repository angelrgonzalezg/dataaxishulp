import { Worker } from 'worker_threads';
import path from 'path';

type Pending = {
  resolve: (value: Record<string, unknown>) => void;
  reject: (error: Error) => void;
};

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();

function workerPath(): string {
  return path.join(__dirname, 'tediousWorker.cjs');
}

function ensureWorker(): Worker {
  if (worker) return worker;

  const w = new Worker(workerPath());
  w.on('message', (msg: { id: number; ok: boolean; error?: string } & Record<string, unknown>) => {
    const entry = pending.get(msg.id);
    if (!entry) return;
    pending.delete(msg.id);
    if (msg.ok) {
      entry.resolve(msg);
    } else {
      entry.reject(new Error(msg.error ?? 'Tedious worker failed'));
    }
  });
  w.on('error', (error) => {
    for (const entry of pending.values()) {
      entry.reject(error instanceof Error ? error : new Error(String(error)));
    }
    pending.clear();
    worker = null;
  });
  w.on('exit', (code) => {
    if (pending.size > 0) {
      const err = new Error(`Tedious worker exited (code ${code})`);
      for (const entry of pending.values()) {
        entry.reject(err);
      }
      pending.clear();
    }
    worker = null;
  });

  worker = w;
  // Don't keep CLI scripts alive solely because of the isolate.
  w.unref();
  return w;
}

function callWorker<T extends Record<string, unknown>>(
  message: Record<string, unknown>,
): Promise<T> {
  const id = nextId++;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, {
      resolve: (value) => resolve(value as T),
      reject,
    });
    try {
      ensureWorker().postMessage({ ...message, id });
    } catch (error) {
      pending.delete(id);
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

export async function testTediousConnectionIsolated(
  url: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await callWorker({ type: 'test', url });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function queryTediousIsolated<T extends Record<string, unknown>>(
  systemKey: string,
  url: string,
  sql: string,
  params: Record<string, unknown> = {},
): Promise<{ rows: T[]; rowsAffected: number }> {
  const result = await callWorker<{ rows: T[]; rowsAffected: number }>({
    type: 'query',
    systemKey,
    url,
    sql,
    params,
  });
  return { rows: result.rows ?? [], rowsAffected: result.rowsAffected ?? 0 };
}

export async function executeTediousProcedureIsolated<T extends Record<string, unknown>>(
  systemKey: string,
  url: string,
  procedureName: string,
  params: Record<string, unknown> = {},
): Promise<{
  rows: T[];
  recordsets: T[][];
  returnValue: number | null;
  rowsAffected: number;
}> {
  const result = await callWorker<{
    rows: T[];
    recordsets: T[][];
    returnValue: number | null;
    rowsAffected: number;
  }>({
    type: 'execute',
    systemKey,
    url,
    procedureName,
    params,
  });
  return {
    rows: result.rows ?? [],
    recordsets: result.recordsets ?? [],
    returnValue: result.returnValue ?? null,
    rowsAffected: result.rowsAffected ?? 0,
  };
}

export async function closeTediousIsolated(systemKey: string): Promise<void> {
  try {
    await callWorker({ type: 'close', systemKey });
  } catch {
    // ignore — worker may already be gone
  }
}
