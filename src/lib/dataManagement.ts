// ============================================================================
// Murgh Mandi ERP — data management helpers (src/lib/dataManagement.ts)
//
// Backup import through the outbox + danger-zone full wipe. This module only
// *uses* the sync engine / offline store / Supabase client; it does not change
// replay semantics.
// ============================================================================

import { supabase } from './supabase';
import { persist, withUuid } from './remote';
import { clearOutbox } from './offline';
import type { OutboxTable } from './db';
import type { AppState } from '../services/store';
import { exportFullBackupJSON } from '../utils/exportImport';

/** AppState collection key -> server table for outbox upserts. */
const COLLECTION_TABLE: Record<string, OutboxTable> = {
  parties: 'parties',
  invoices: 'invoices',
  receipts: 'receipts',
  purchases: 'purchases',
  expenses: 'expenses',
  orders: 'orders',
  vehicles: 'vehicles',
  trips: 'trips',
  inventory: 'products',
  employees: 'employees',
  generalEntries: 'journal_entries',
  dayClosing: 'day_closings',
};

export interface ImportResult {
  /** Total docs queued across all tables. */
  imported: number;
  /** Per-table queued counts. */
  tables: Record<string, number>;
  /** Non-fatal per-table errors (import continues past them). */
  errors: string[];
  /** Docs skipped because they had no usable shape. */
  skipped: number;
}

/**
 * Queue every record of a validated backup state for background sync.
 *
 * Each doc is normalized to a UUID id (server PKs are UUID) and upserted via
 * the existing outbox persist() path, so the sync engine pushes it to
 * Supabase and the app reconciles server-wins afterwards.
 *
 * Defensive: tables are handled independently — one table's failure is
 * collected and never aborts the remaining tables. Replay semantics of the
 * sync engine itself are untouched.
 *
 * NOTE: journal_entries must be wrapped as { entry } — that is the payload
 * shape src/lib/sync.ts expects for this table.
 */
export async function importBackupToOutbox(state: AppState): Promise<ImportResult> {
  const result: ImportResult = { imported: 0, tables: {}, errors: [], skipped: 0 };

  for (const [key, table] of Object.entries(COLLECTION_TABLE)) {
    try {
      const raw: unknown = (state as unknown as Record<string, unknown>)[key];
      const docs = Array.isArray(raw) ? raw : raw ? [raw] : [];
      let n = 0;
      for (const doc of docs) {
        if (!doc || typeof doc !== 'object') {
          result.skipped++;
          continue;
        }
        const withId = withUuid({
          ...(doc as Record<string, unknown>),
          id: (doc as { id?: unknown }).id ?? crypto.randomUUID(),
        } as { id: string });
        // sync.ts unwraps journal entries from payload.entry
        const payload = table === 'journal_entries' ? { entry: withId } : withId;
        await persist('upsert', table, payload as never);
        n++;
      }
      result.tables[table] = n;
      result.imported += n;
    } catch (e) {
      result.errors.push(`${key}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // chart_of_accounts has no outbox table; upsert directly (owner-only UI).
  // Kept separate so a failure here never affects the outbox tables above.
  try {
    const accounts = Array.isArray(state.accounts) ? state.accounts : [];
    let n = 0;
    for (const a of accounts) {
      if (!a || typeof a !== 'object') {
        result.skipped++;
        continue;
      }
      const row = {
        id: (a as { id?: string }).id,
        account_code: (a as { code?: string }).code,
        name: (a as { name?: string }).name,
        urdu_name: (a as { urduName?: string }).urduName,
        category: (a as { category?: string }).category,
        balance: (a as { balance?: number }).balance ?? 0,
      };
      if (!row.id || !row.account_code) {
        result.skipped++;
        continue;
      }
      const { error } = await supabase
        .from('chart_of_accounts')
        .upsert(row, { onConflict: 'account_code' });
      if (error) throw error;
      n++;
    }
    result.tables['chart_of_accounts'] = n;
    result.imported += n;
  } catch (e) {
    result.errors.push(`accounts: ${e instanceof Error ? e.message : String(e)}`);
  }

  return result;
}

/** One-click full JSON backup download (every collection + metadata). */
export function downloadFullBackup(appState: AppState): void {
  exportFullBackupJSON(appState);
}

const LOCAL_STORAGE_KEY = 'murgh_mandi_erp_data_v1';
const IDB_NAME = 'murgh-mandi-erp';

/**
 * Danger-zone wipe: calls the owner-guarded public.clean_all_data() RPC,
 * then clears all local caches (outbox, IndexedDB snapshots, localStorage)
 * and reloads the app to a blank state.
 */
export async function cleanAllDataAndResetLocal(): Promise<void> {
  const { error } = await supabase.rpc('clean_all_data');
  if (error) throw new Error(error.message);

  try {
    await clearOutbox();
  } catch {
    /* IndexedDB unavailable — continue */
  }
  try {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase(IDB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
  } catch {
    /* ignore */
  }
  try {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  window.location.reload();
}
