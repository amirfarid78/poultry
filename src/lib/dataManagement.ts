// ============================================================================
// Murgh Mandi ERP — data management helpers (src/lib/dataManagement.ts)
//
// Backup import through the outbox + danger-zone full wipe. This module only
// *uses* the sync engine / offline store / Supabase client; it does not change
// replay semantics.
// ============================================================================

import { supabase } from './supabase';
import { persist, withUuid } from './remote';
import { clearOutbox, isUuid } from './offline';
import type { OutboxTable } from './db';
import type { AppState } from '../services/store';
import { createBlankState } from '../services/store';
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
 * Re-UUID a restored backup state so every non-UUID (seed / legacy local)
 * id becomes a fresh UUID — and rewrite every reference to point at the new
 * ids, so the restored state stays internally consistent.
 *
 * Pure function (no I/O): the parent calls it in App/SettingsView BEFORE
 * onImportState, and importBackupToOutbox applies it again (idempotent —
 * ids that are already UUIDs map to themselves, so a second pass is a
 * no-op). References to profiles (driverId / bookerId / lockedBy) are left
 * alone: profiles are not part of the backup state, so there is nothing to
 * remap them to. Accounts carry no id (keyed by account_code) and are
 * passed through unchanged.
 */
export function remapStateIds(state: AppState): { state: AppState; idMap: Record<string, string> } {
  const idMap: Record<string, string> = {};
  const collect = (id: unknown): void => {
    if (typeof id === 'string' && id && !isUuid(id) && !idMap[id]) {
      idMap[id] = crypto.randomUUID();
    }
  };
  // First pass: one fresh UUID per non-UUID id, across all collections.
  for (const p of state.parties ?? []) collect(p.id);
  for (const i of state.invoices ?? []) collect(i.id);
  for (const r of state.receipts ?? []) collect(r.id);
  for (const l of state.ledgerEntries ?? []) collect(l.id);
  for (const p of state.purchases ?? []) collect(p.id);
  for (const e of state.expenses ?? []) collect(e.id);
  for (const g of state.generalEntries ?? []) collect(g.id);
  for (const o of state.orders ?? []) collect(o.id);
  for (const v of state.vehicles ?? []) collect(v.id);
  for (const t of state.trips ?? []) collect(t.id);
  for (const i of state.inventory ?? []) collect(i.id);
  for (const e of state.employees ?? []) collect(e.id);
  if (state.dayClosing) collect(state.dayClosing.id);

  // Second pass: rewrite ids + every reference that points at a remapped id.
  const remap = (id: string | undefined): string | undefined =>
    id !== undefined && idMap[id] !== undefined ? idMap[id] : id;
  const remapId = (id: string): string => idMap[id] ?? id;

  const next: AppState = {
    ...state,
    parties: (state.parties ?? []).map((p) => ({ ...p, id: remapId(p.id) })),
    invoices: (state.invoices ?? []).map((i) => ({
      ...i,
      id: remapId(i.id),
      customerId: remap(i.customerId) ?? i.customerId,
      vehicleId: remap(i.vehicleId),
      driverId: remap(i.driverId),
    })),
    receipts: (state.receipts ?? []).map((r) => ({
      ...r,
      id: remapId(r.id),
      partyId: remap(r.partyId) ?? r.partyId,
    })),
    ledgerEntries: (state.ledgerEntries ?? []).map((l) => ({
      ...l,
      id: remapId(l.id),
      partyId: remap(l.partyId) ?? l.partyId,
      refId: remap(l.refId),
    })),
    purchases: (state.purchases ?? []).map((p) => ({
      ...p,
      id: remapId(p.id),
      supplierId: remap(p.supplierId) ?? p.supplierId,
    })),
    expenses: (state.expenses ?? []).map((e) => ({
      ...e,
      id: remapId(e.id),
      vehicleId: remap(e.vehicleId),
    })),
    generalEntries: (state.generalEntries ?? []).map((g) => ({
      ...g,
      id: remapId(g.id),
      partyId: remap(g.partyId),
    })),
    orders: (state.orders ?? []).map((o) => ({
      ...o,
      id: remapId(o.id),
      customerId: remap(o.customerId) ?? o.customerId,
      bookerId: remap(o.bookerId) ?? o.bookerId,
      assignedVehicleId: remap(o.assignedVehicleId),
      assignedDriverId: remap(o.assignedDriverId),
    })),
    vehicles: (state.vehicles ?? []).map((v) => ({
      ...v,
      id: remapId(v.id),
      driverId: remap(v.driverId),
    })),
    trips: (state.trips ?? []).map((t) => ({
      ...t,
      id: remapId(t.id),
      vehicleId: remap(t.vehicleId) ?? t.vehicleId,
      driverId: remap(t.driverId) ?? t.driverId,
      stops: (t.stops ?? []).map((s) => ({
        ...s,
        customerId: remap(s.customerId) ?? s.customerId,
      })),
    })),
    inventory: (state.inventory ?? []).map((i) => ({ ...i, id: remapId(i.id) })),
    employees: (state.employees ?? []).map((e) => ({ ...e, id: remapId(e.id) })),
    dayClosing: state.dayClosing
      ? { ...state.dayClosing, id: remapId(state.dayClosing.id) }
      : state.dayClosing,
  };
  return { state: next, idMap };
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
  // Re-UUID the backup first (idempotent — see remapStateIds) so the
  // outbox payloads match the local state the parent just restored.
  const src = remapStateIds(state).state;
  const result: ImportResult = { imported: 0, tables: {}, errors: [], skipped: 0 };

  for (const [key, table] of Object.entries(COLLECTION_TABLE)) {
    try {
      const raw: unknown = (src as unknown as Record<string, unknown>)[key];
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
  // The backup id is deliberately omitted: accounts are keyed by
  // account_code and the DB defaults a fresh UUID for new rows (sending a
  // stale/seed id verbatim used to collide with or overwrite live rows).
  try {
    const accounts = Array.isArray(src.accounts) ? src.accounts : [];
    let n = 0;
    for (const a of accounts) {
      if (!a || typeof a !== 'object') {
        result.skipped++;
        continue;
      }
      const row = {
        account_code: (a as { code?: string }).code,
        name: (a as { name?: string }).name,
        urdu_name: (a as { urduName?: string }).urduName,
        category: (a as { category?: string }).category,
        balance: (a as { balance?: number }).balance ?? 0,
      };
      if (!row.account_code) {
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
    // Save an explicit BLANK state (not seed data) so the reload starts empty.
    // Preserve the user's language preference.
    let lang: 'en' | 'ur' = 'ur';
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.language === 'en' || parsed.language === 'ur') lang = parsed.language;
      }
    } catch { /* ignore */ }
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(createBlankState(lang)));
    // Also clear the business-settings cache so it refetches fresh.
    localStorage.removeItem('nawaz_poultry_business_settings_v1');
  } catch {
    /* ignore */
  }
  window.location.reload();
}
