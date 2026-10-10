// ============================================================================
// Murgh Mandi ERP — offline persistence (src/lib/offline.ts)
//
// IndexedDB (via idb) backing two stores:
//   * mm_outbox — durable write queue; every offline mutation is enqueued here
//     and replayed against Supabase by the sync engine (src/lib/sync.ts).
//   * mm_cache  — offline bootstrap snapshots (e.g. last good fetchAll result).
// ============================================================================

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export type OutboxOp = 'insert' | 'update' | 'delete' | 'upsert';

export interface OutboxEntry {
  /** Queue id (random UUID, keyPath). */
  id: string;
  op: OutboxOp;
  /** Server table name, e.g. 'invoices'. See OutboxTable in db.ts. */
  table: string;
  /** camelCase app payload (the sync engine maps it to a DB row). */
  payload: Record<string, unknown>;
  /** Client-generated entity id used for idempotent replay. */
  idempotency_key: string;
  created_at: string;
  attempts: number;
  last_error: string | null;
}

export interface CacheEntry {
  key: string;
  data: unknown;
  updated_at: string;
}

interface MmDb extends DBSchema {
  mm_outbox: {
    key: string;
    value: OutboxEntry;
    indexes: { 'by-created': string };
  };
  mm_cache: {
    key: string;
    value: CacheEntry;
  };
}

const DB_NAME = 'murgh-mandi-erp';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<MmDb>> | null = null;

function getDb(): Promise<IDBPDatabase<MmDb>> {
  if (!dbPromise) {
    dbPromise = openDB<MmDb>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('mm_outbox')) {
          const outbox = db.createObjectStore('mm_outbox', { keyPath: 'id' });
          outbox.createIndex('by-created', 'created_at', { unique: false });
        }
        if (!db.objectStoreNames.contains('mm_cache')) {
          db.createObjectStore('mm_cache', { keyPath: 'key' });
        }
      },
    });
  }
  return dbPromise;
}

const newId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

/** Queue a write for later replay. Returns the queue entry id. */
export async function enqueueWrite(
  op: OutboxOp,
  table: string,
  payload: Record<string, unknown>
): Promise<string> {
  const db = await getDb();
  const entry: OutboxEntry = {
    id: newId(),
    op,
    table,
    payload,
    idempotency_key: str(payload.id) || newId(),
    created_at: new Date().toISOString(),
    attempts: 0,
    last_error: null,
  };
  await db.put('mm_outbox', entry);
  return entry.id;
}

/** Number of writes still waiting to be replayed. */
export async function getPendingCount(): Promise<number> {
  const db = await getDb();
  return db.count('mm_outbox');
}

/** All queued writes, oldest first. */
export async function peekOutbox(): Promise<OutboxEntry[]> {
  const db = await getDb();
  return db.getAllFromIndex('mm_outbox', 'by-created');
}

/** Store a snapshot (e.g. last good fetchAll) for offline bootstrap. */
export async function saveSnapshot(key: string, data: unknown): Promise<void> {
  const db = await getDb();
  await db.put('mm_cache', {
    key,
    data,
    updated_at: new Date().toISOString(),
  });
}

/** Read a snapshot; null when never cached. */
export async function getSnapshot<T = unknown>(key: string): Promise<{ data: T; updated_at: string } | null> {
  const db = await getDb();
  const entry = await db.get('mm_cache', key);
  return entry ? { data: entry.data as T, updated_at: entry.updated_at } : null;
}

/** Drop a queue entry after a successful replay. */
export async function removeOutbox(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('mm_outbox', id);
}

/** Record a failed replay attempt (entry stays queued for the next run). */
export async function markOutboxError(id: string, msg: string): Promise<void> {
  const db = await getDb();
  const entry = await db.get('mm_outbox', id);
  if (!entry) return;
  entry.attempts += 1;
  entry.last_error = msg;
  await db.put('mm_outbox', entry);
}

/** Danger zone: clear the whole outbox (e.g. after user-confirmed discard). */
export async function clearOutbox(): Promise<void> {
  const db = await getDb();
  await db.clear('mm_outbox');
}
