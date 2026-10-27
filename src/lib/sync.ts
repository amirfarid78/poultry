// ============================================================================
// Murgh Mandi ERP — sync engine (src/lib/sync.ts)
//
// Replays the IndexedDB outbox (src/lib/offline.ts) against Supabase.
//
// Replay semantics
//   * Outbox entries are replayed oldest-first.
//   * insert/upsert -> upsert with onConflict of the table's unique key
//     (client-generated UUIDs make every replay idempotent).
//   * update        -> update().eq('id', payload.id)
//   * delete        -> delete().eq('id', payload.id)
//   * trip_pings    -> plain INSERT (append-only BIGSERIAL id, no conflict key).
//   * journal_entries -> insertJournalEntry; a duplicate-key error means the
//     entry already exists, so it is treated as already synced and dropped.
//   * One failing entry does NOT stop the run: attempts/last_error are
//     recorded and the engine continues with the rest.
//   * An entry failing MAX_SYNC_ATTEMPTS times in a row is quarantined
//     ("dead"): it leaves the live queue so one poison entry can't wedge
//     syncing forever, and the UI surfaces it with its error plus a manual
//     retry. Dead entries still shield their local changes in the
//     reconciler (see remote.ts) until they replay.
//   * replayOne returns false to defer an entry quietly (stays queued, no
//     failure recorded): a ledger edit whose optimistic led-… row can't be
//     resolved yet waits for its doc's insert to land first.
//   * Invoice edits are chained: the reissued invoice waits until its void
//     has replayed, so a failed void can never double-count the sale on the
//     server.
//
// Conflict rule (documented): last-write-wins with the SERVER as the source
// of truth. Replay upserts overwrite the server row for the same key, so the
// most recently replayed offline write wins over older server state. After a
// sync the client always re-fetches, so whatever the server holds is what the
// UI shows. Concurrent edits from two devices resolve to "whoever reached the
// server last wins" — there is no field-level merge.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  mapToDbRow,
  conflictTarget,
  insertJournalEntry,
  type OutboxTable,
} from './db';
import type { GeneralJournalEntry } from '../types';
import {
  peekOutbox,
  getPendingCount,
  peekDeadEntries,
  getDeadCount,
  reviveDeadEntries,
  removeOutbox,
  markOutboxError,
  isUuid,
  outboxEntityId,
  type OutboxEntry,
} from './offline';

export interface SyncStatus {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  /** Quarantined entries (failed MAX_SYNC_ATTEMPTS times, awaiting manual retry). */
  deadCount: number;
  /** First quarantined entry's error, for the failure UI. */
  deadError: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
}

export interface SyncEngine {
  getStatus(): SyncStatus;
  subscribe(fn: (status: SyncStatus) => void): () => void;
  syncNow(): Promise<void>;
  /** Move quarantined entries back to the live queue and sync immediately. */
  retryFailed(): Promise<void>;
}

const SYNC_INTERVAL_MS = 30_000;

const errMsg = (e: unknown): string =>
  e instanceof Error ? e.message : typeof e === 'string' ? e : JSON.stringify(e);

const isDuplicateKey = (e: unknown): boolean =>
  /duplicate key|already exists|unique constraint|23505/i.test(errMsg(e));

const strOrNull = (v: unknown): string | null =>
  typeof v === 'string' && v ? v : null;

/** Doc tables that post ledger rows, keyed by ledger ref_type. */
const LEDGER_DOC_TABLE: Record<string, string> = {
  invoice: 'invoices',
  invoice_charge: 'invoices',
  invoice_payment: 'invoices',
  receipt: 'receipts',
  purchase: 'purchases',
};

type RowResolution =
  | { kind: 'found'; id: string }
  | { kind: 'missing' } // no server row (yet?)
  | { kind: 'ambiguous' }; // several rows match; cannot pick safely

/**
 * Resolve an optimistic local ledger id (led-…) to the trigger-posted server
 * row. edit_ledger_entry takes a UUID p_entry_id — sending a non-UUID raises
 * PostgREST 22P02 before the function body runs, which used to poison the
 * outbox permanently. Never send a non-UUID.
 */
async function resolveLedgerRowId(
  db: SupabaseClient,
  p: { refId?: string; refType?: string; partyId?: string; debit?: number; credit?: number }
): Promise<RowResolution> {
  if (!p.refId || !p.refType || !p.partyId) return { kind: 'ambiguous' };
  const { data, error } = await db
    .from('ledger_entries')
    .select('id,debit,credit')
    .eq('ref_id', p.refId)
    .eq('ref_type', p.refType)
    .eq('party_id', p.partyId)
    .eq('is_void', false);
  if (error) throw error;
  const rows = data ?? [];
  if (rows.length === 1) return { kind: 'found', id: rows[0].id as string };
  if (rows.length > 1) {
    // One invoice can post several invoice_charge rows sharing
    // (ref_id, ref_type): disambiguate by amount (amounts are locked on
    // document rows, so the payload amount is the row's amount).
    const r = (v: unknown) => Math.round(Number(v) || 0);
    const byAmt = rows.filter(
      (x) => r(x.debit) === r(p.debit) && r(x.credit) === r(p.credit)
    );
    if (byAmt.length === 1) return { kind: 'found', id: byAmt[0].id as string };
    return { kind: 'ambiguous' };
  }
  return { kind: 'missing' };
}

/**
 * Replay one entry. Returns true when the entry was handled and can be
 * removed, false to defer it quietly (stays queued for a later run without
 * counting as a failure).
 */
async function replayOne(
  db: SupabaseClient,
  entry: OutboxEntry,
  pendingInserts: Set<string>
): Promise<boolean> {
  const table = entry.table as OutboxTable;

  // Void pseudo-tables: route to the SECURITY DEFINER void RPCs (they own
  // the ledger reversals; the client never writes ledger_entries directly).
  // ledger_edits: route to the edit_ledger_entry RPC (it owns the running-
  // balance recompute on the server).
  if (table === 'invoice_voids' || table === 'receipt_voids' || table === 'ledger_edits') {
    if (table === 'ledger_edits') {
      const p = entry.payload as {
        entryId?: string;
        entryDate?: string;
        detail?: string;
        detailUrdu?: string;
        debit?: number;
        credit?: number;
        refId?: string;
        refType?: string;
        partyId?: string;
      };
      if (!p.entryDate) return true; // nothing to apply; drop
      let rpcId: string | null = null;
      if (isUuid(p.entryId)) {
        rpcId = p.entryId;
      } else {
        // Optimistic local id (led-…): the trigger-posted server row carries
        // the real UUID — resolve it exactly, never guess.
        const res = await resolveLedgerRowId(db, p);
        if (res.kind === 'found') {
          rpcId = res.id;
        } else if (res.kind === 'missing') {
          // The doc itself hasn't synced yet: leave the edit queued — it
          // resolves on a later run once the doc's insert replays. But if no
          // insert of the doc is pending either, the doc is never coming:
          // drop the edit instead of waiting forever.
          const docTable = p.refType ? LEDGER_DOC_TABLE[p.refType] : undefined;
          const docKey = docTable && p.refId ? `${docTable}:${p.refId}` : null;
          if (docKey && pendingInserts.has(docKey)) return false; // defer quietly
          return true; // drop
        } else {
          // Ambiguous (e.g. twin charge rows with equal amounts): editing
          // the wrong row would corrupt the khata, so drop rather than guess.
          return true;
        }
      }
      const { error } = await db.rpc('edit_ledger_entry', {
        p_entry_id: rpcId,
        p_entry_date: p.entryDate,
        p_detail: p.detail ?? '',
        p_detail_urdu: p.detailUrdu ?? null,
        p_debit: p.debit ?? 0,
        p_credit: p.credit ?? 0,
        p_ref_id: p.refId ?? null,
        p_ref_type: p.refType ?? null,
        p_party_id: p.partyId ?? null,
      });
      if (error) throw error;
      return true;
    }
    const p = entry.payload as { invoiceId?: string; receiptId?: string; reason?: string };
    const reason = typeof p.reason === 'string' && p.reason ? p.reason : 'Voided by user';
    if (table === 'invoice_voids') {
      if (!p.invoiceId) return true;
      const { error } = await db.rpc('void_invoice', {
        p_invoice_id: p.invoiceId,
        p_reason: reason,
      });
      if (error) throw error;
      return true;
    }
    if (!p.receiptId) return true;
    const { error } = await db.rpc('void_receipt', {
      p_receipt_id: p.receiptId,
      p_reason: reason,
    });
    if (error) throw error;
    return true;
  }

  // journal_entries needs account-code resolution + line inserts; a
  // duplicate-key failure means "already synced" -> drop the entry.
  if (table === 'journal_entries') {
    if (entry.op === 'delete') {
      const id = (entry.payload as { id?: string }).id;
      if (!id) return true;
      // Delete lines first (FK), then the entry itself.
      const { error: lineErr } = await db
        .from('journal_lines')
        .delete()
        .eq('journal_entry_id', id);
      if (lineErr) throw lineErr;
      const { error } = await db.from('journal_entries').delete().eq('id', id);
      if (error) throw error;
      return true;
    }
    // Accept both { entry } (App + import path) and the raw entry (defensive).
    const je =
      (entry.payload as { entry?: GeneralJournalEntry }).entry ??
      (entry.payload as unknown as GeneralJournalEntry);
    try {
      await insertJournalEntry(db, je);
    } catch (e) {
      if (isDuplicateKey(e)) return true;
      throw e;
    }
    return true;
  }

  if (entry.op === 'delete') {
    const id = (entry.payload as Record<string, unknown>).id;
    const { error } = await db.from(table).delete().eq('id', id);
    if (error) throw error;
    return true;
  }

  const row = mapToDbRow(table, entry.payload);

  if (entry.op === 'update') {
    const { id, ...rest } = row;
    // Strip null/undefined so partial updates never wipe columns.
    const cleaned = Object.fromEntries(
      Object.entries(rest).filter(([, v]) => v !== undefined && v !== null)
    );
    const { error } = await db.from(table).update(cleaned).eq('id', id);
    if (error) throw error;
    return true;
  }

  // insert | upsert
  const target = conflictTarget(table);
  if (target === null) {
    // trip_pings: append-only, no conflict key.
    const { error } = await db.from(table).insert(row);
    if (error) throw error;
    return true;
  }
  const { error } = await db.from(table).upsert(row, { onConflict: target });
  if (error) throw error;
  return true;
}

let singleton: SyncEngine | null = null;

/**
 * Starts (or returns) the process-wide sync engine. Safe to call repeatedly;
 * the first call's client is kept.
 */
export function startSyncEngine(db: SupabaseClient): SyncEngine {
  if (singleton) return singleton;

  const listeners = new Set<(s: SyncStatus) => void>();
  const state: SyncStatus = {
    isOnline: typeof navigator === 'undefined' ? true : navigator.onLine,
    isSyncing: false,
    pendingCount: 0,
    deadCount: 0,
    deadError: null,
    lastSyncAt: null,
    lastError: null,
  };

  // The snapshot handed to useSyncExternalStore MUST be referentially stable:
  // a fresh object on every getStatus() call makes React think the store
  // changed on every render -> infinite re-render loop (React error #185).
  let snapshot: SyncStatus = { ...state };

  const emit = () => {
    listeners.forEach((fn) => fn(snapshot));
  };

  const setState = (patch: Partial<SyncStatus>) => {
    Object.assign(state, patch);
    snapshot = { ...state };
    emit();
  };

  const refreshPending = async () => {
    try {
      const [pendingCount, dead] = await Promise.all([
        getPendingCount(),
        peekDeadEntries(),
      ]);
      setState({
        pendingCount,
        deadCount: dead.length,
        deadError: dead.length > 0 ? dead[0].last_error : null,
      });
    } catch {
      /* IndexedDB unavailable; leave counts as-is */
    }
  };

  async function syncNow(): Promise<void> {
    if (state.isSyncing) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      await refreshPending();
      return;
    }
    setState({ isSyncing: true, lastError: null });
    try {
      const entries = await peekOutbox();
      // Invoice edits enqueue (void old, insert reissue) as a pair: the
      // reissue must never land while its void is still pending, or the
      // server would hold both invoices active (double sale, double ledger
      // rows, wrong balances). Collect voided doc ids from the full queue
      // (live + quarantined) — a quarantined void also blocks its reissue.
      const voidedIds = new Set<string>();
      try {
        for (const e of await peekOutbox(true)) {
          if (e.table === 'invoice_voids') {
            const id = outboxEntityId(e);
            if (id) voidedIds.add(id);
          }
        }
      } catch {
        /* fall back to the live peek below */
      }
      // Doc (table:id) keys with a pending insert/upsert — used to defer a
      // ledger edit whose optimistic row can't resolve yet.
      const pendingInserts = new Set<string>();
      for (const e of entries) {
        if (e.op === 'insert' || e.op === 'upsert') {
          const id = outboxEntityId(e);
          if (id) pendingInserts.add(`${e.table}:${id}`);
        }
      }
      const voidDone = new Set<string>();
      let lastError: string | null = null;
      for (const entry of entries) {
        // Chaining: a reissued invoice waits for its void to land first.
        if (entry.table === 'invoices' && (entry.op === 'insert' || entry.op === 'upsert')) {
          const vid = strOrNull((entry.payload as Record<string, unknown>).voidsInvoiceId);
          if (vid && voidedIds.has(vid) && !voidDone.has(vid)) continue;
        }
        try {
          const done = await replayOne(db, entry, pendingInserts);
          if (done) {
            await removeOutbox(entry.id);
            if (entry.table === 'invoice_voids') {
              const id = outboxEntityId(entry);
              if (id) voidDone.add(id);
            }
          }
          // !done: deferred quietly — stays queued for a later run without
          // counting as a failure.
        } catch (e) {
          const msg = errMsg(e);
          lastError = msg;
          await markOutboxError(entry.id, msg).catch(() => {});
          // continue with the rest of the queue
        }
      }
      const [pendingCount, dead] = await Promise.all([
        getPendingCount().catch(() => state.pendingCount),
        peekDeadEntries().catch(() => [] as OutboxEntry[]),
      ]);
      setState({
        pendingCount,
        deadCount: dead.length,
        deadError: dead.length > 0 ? dead[0].last_error : state.deadError,
        lastSyncAt: new Date().toISOString(),
        lastError,
      });
    } finally {
      setState({ isSyncing: false });
    }
  }

  const engine: SyncEngine = {
    getStatus: () => snapshot,
    subscribe: (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    syncNow,
    retryFailed: async () => {
      try {
        await reviveDeadEntries();
      } catch {
        /* IndexedDB unavailable; just sync */
      }
      await refreshPending();
      await syncNow();
    },
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      setState({ isOnline: true });
      void syncNow();
    });
    window.addEventListener('offline', () => setState({ isOnline: false }));
  }

  // Initial count, then a 30s tick that refreshes the count and syncs when online.
  void refreshPending();
  const timer = setInterval(() => {
    void refreshPending();
    if (typeof navigator === 'undefined' || navigator.onLine) void syncNow();
  }, SYNC_INTERVAL_MS);
  // Don't keep a node/bun process alive for tests.
  if (typeof timer === 'object' && 'unref' in timer) (timer as { unref(): void }).unref();

  singleton = engine;
  return engine;
}

/** The running engine, or null when startSyncEngine has not been called yet. */
export function getSyncEngine(): SyncEngine | null {
  return singleton;
}

/** Test/SSR escape hatch: drop the singleton so a fresh engine can start. */
export function resetSyncEngine(): void {
  singleton = null;
}
