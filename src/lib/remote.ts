// Remote-sync integration helpers for App.tsx.
// Pattern: every mutation applies the existing local logic (instant, offline-capable)
// and then enqueues the base document into the IndexedDB outbox. The sync engine
// replays the outbox; afterwards the app re-fetches and reconciles with the
// server as the source of truth (DB triggers own ledger posting and balances).
import type { AppState } from '../services/store';
import type { OutboxEntry, OutboxOp } from './offline';
import { enqueueWrite, peekOutbox, saveSnapshot } from './offline';
import { getSyncEngine } from './sync';
import type { OutboxTable } from './db';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (v: unknown): v is string =>
  typeof v === 'string' && UUID_RE.test(v);

/** Guarantee a UUID primary key for a newly created doc (views use local id schemes). */
export function withUuid<T extends { id: string }>(doc: T): T {
  return isUuid(doc.id) ? doc : { ...doc, id: crypto.randomUUID() };
}

/**
 * Queue a write for background sync and kick the engine (no-op when offline).
 * Never throws — local state is always the fallback.
 */
export async function persist(
  op: OutboxOp,
  table: OutboxTable,
  payload: any
): Promise<void> {
  try {
    await enqueueWrite(op, table, payload);
    getSyncEngine()?.syncNow().catch(() => {});
  } catch {
    /* IndexedDB unavailable; localStorage still holds the state */
  }
}

/** Only sync docs that can exist server-side (skip local demo/seed ids). */
export function persistIfUuid(
  op: OutboxOp,
  table: OutboxTable,
  payload: { id: string }
): void {
  if (!isUuid(payload.id)) return;
  void persist(op, table, payload);
}

const TABLE_STATE_KEY: Record<string, keyof AppState> = {
  parties: 'parties',
  invoices: 'invoices',
  receipts: 'receipts',
  purchases: 'purchases',
  expenses: 'expenses',
  orders: 'orders',
  vehicles: 'vehicles',
  trips: 'trips',
  products: 'inventory',
  chart_of_accounts: 'accounts',
  employees: 'employees',
  journal_entries: 'generalEntries',
  // Void pseudo-tables map back to their document collections so a pending
  // void keeps the local voided doc, its ledger rows and the party balance
  // until the server RPC applies it. ledger_edits map to ledgerEntries so a
  // pending edit keeps the local edited row.
  invoice_voids: 'invoices',
  receipt_voids: 'receipts',
  ledger_edits: 'ledgerEntries',
};

interface PendingOps {
  /**
   * Entity ids with an unpushed insert/update/upsert/void/edit: the local
   * row is fresher than whatever the server holds, so it wins the merge
   * until the outbox entry replays.
   */
  pending: Set<string>;
  /**
   * Entity ids with an unpushed hard delete: the server row must stay gone
   * instead of being resurrected by the refresh.
   */
  deleted: Set<string>;
}

const strOrNull = (v: unknown): string | null =>
  typeof v === 'string' && v ? v : null;

/**
 * The entity id an outbox entry acts on. The void/edit pseudo-tables carry
 * it under their own payload key (invoiceId / receiptId / entryId), not `id`.
 */
function entityIdFor(entry: OutboxEntry): string | null {
  const p = entry.payload as Record<string, unknown>;
  switch (entry.table) {
    case 'invoice_voids':
      return strOrNull(p.invoiceId) ?? strOrNull(p.id);
    case 'receipt_voids':
      return strOrNull(p.receiptId) ?? strOrNull(p.id);
    case 'ledger_edits':
      return strOrNull(p.entryId) ?? strOrNull(p.id);
    default:
      return strOrNull(p.id);
  }
}

/**
 * Group pending outbox entries (live AND quarantined — an unapplied local
 * change stays the freshest known state either way) by app-state collection.
 *
 * Also collects doc ids with a pending void: until the void RPC lands, the
 * server's ledger rows for that doc are stale, so the local voided originals
 * + reversal rows win, and the voided doc + its party balance stay local.
 */
function pendingByTable(pending: OutboxEntry[]): {
  byTable: Record<string, PendingOps>;
  voidRefIds: Set<string>;
} {
  const byTable: Record<string, PendingOps> = {};
  const voidRefIds = new Set<string>();
  const ops = (key: string): PendingOps =>
    (byTable[key] ??= { pending: new Set<string>(), deleted: new Set<string>() });
  for (const e of pending) {
    const id = entityIdFor(e);
    if (!id) continue;
    if (e.table === 'invoice_voids' || e.table === 'receipt_voids') {
      voidRefIds.add(id);
      const key = TABLE_STATE_KEY[e.table];
      if (key) ops(key).pending.add(id);
      // The void owns the party balance until the server applies it.
      const partyId = strOrNull((e.payload as Record<string, unknown>).partyId);
      if (partyId) ops('parties').pending.add(partyId);
      continue;
    }
    const key = TABLE_STATE_KEY[e.table];
    if (!key) continue;
    if (e.op === 'delete') ops(key).deleted.add(id);
    else ops(key).pending.add(id);
  }
  return { byTable, voidRefIds };
}

/**
 * Server-wins merge that respects unpushed local writes.
 *
 * The old version only protected locally-created docs that don't exist on
 * the server yet — any update/delete/void/edit of an EXISTING doc was
 * silently clobbered by the stale server row on every refresh ("old data
 * reappears"). Now:
 *  - server row with a pending hard delete  -> dropped (stays deleted)
 *  - server row with a pending write        -> local row wins (it's fresher)
 *  - otherwise                              -> server row wins (unchanged)
 *  - local-only docs still in the outbox     -> kept (unchanged)
 *
 * When the outbox is empty this behaves exactly like the old server-wins
 * merge; the new behavior only kicks in for writes that haven't reached
 * the server yet.
 */
export function reconcileState(
  prev: AppState,
  remote: Partial<AppState>,
  pending: OutboxEntry[]
): AppState {
  const { byTable, voidRefIds } = pendingByTable(pending);
  const EMPTY: PendingOps = { pending: new Set<string>(), deleted: new Set<string>() };
  const merge = <T,>(
    local: T[],
    server: T[] | undefined,
    stateKey: string,
    getId: (r: T) => string
  ): T[] => {
    if (!server) return local;
    const p = byTable[stateKey] ?? EMPTY;
    const serverIds = new Set(server.map(getId));
    const localById = new Map<string, T>();
    for (const r of local) localById.set(getId(r), r);
    const out: T[] = [];
    for (const s of server) {
      const id = getId(s);
      if (p.deleted.has(id)) continue;
      const l = localById.get(id);
      if (l !== undefined && p.pending.has(id)) {
        out.push(l);
        continue;
      }
      out.push(s);
    }
    for (const r of local) {
      const id = getId(r);
      if (!serverIds.has(id) && p.pending.has(id) && !p.deleted.has(id)) out.push(r);
    }
    return out;
  };
  const byId = <T extends { id: string }>(r: T) => r.id;

  const next: AppState = {
    ...prev,
    parties: merge(prev.parties, remote.parties, 'parties', byId),
    invoices: merge(prev.invoices, remote.invoices, 'invoices', byId),
    receipts: merge(prev.receipts, remote.receipts, 'receipts', byId),
    purchases: merge(prev.purchases, remote.purchases, 'purchases', byId),
    expenses: merge(prev.expenses, remote.expenses, 'expenses', byId),
    orders: merge(prev.orders, remote.orders, 'orders', byId),
    vehicles: merge(prev.vehicles, remote.vehicles, 'vehicles', byId),
    trips: merge(prev.trips, remote.trips, 'trips', byId),
    inventory: merge(prev.inventory, remote.inventory, 'inventory', byId),
    accounts: merge(prev.accounts, remote.accounts, 'accounts', (a) => a.code),
    employees: merge(prev.employees, remote.employees, 'employees', byId),
    generalEntries: merge(prev.generalEntries, remote.generalEntries, 'generalEntries', byId),
    dayClosing: remote.dayClosing ?? prev.dayClosing,
    todayMandiRate: remote.todayMandiRate ?? prev.todayMandiRate,
  };

  if (remote.ledgerEntries) {
    // Ledger rows are trigger-owned, so a local optimistic row whose refId
    // now exists on the server is normally superseded and dropped — EXCEPT
    // when the doc has a pending void (the server rows are pre-void and
    // stale, the local voided originals + reversals are the truth) or the
    // row itself has a pending ledger edit (the local edited row is fresher).
    const p = byTable['ledgerEntries'] ?? EMPTY;
    const serverIds = new Set(remote.ledgerEntries.map((e) => e.id));
    const serverDocIds = new Set<string>();
    for (const e of remote.ledgerEntries) if (e.refId) serverDocIds.add(e.refId);
    const localById = new Map(prev.ledgerEntries.map((e) => [e.id, e]));
    const out: typeof prev.ledgerEntries = [];
    for (const s of remote.ledgerEntries) {
      if (s.refId && voidRefIds.has(s.refId)) continue;
      const l = localById.get(s.id);
      if (l && p.pending.has(s.id)) {
        out.push(l);
        continue;
      }
      out.push(s);
    }
    const kept = prev.ledgerEntries.filter(
      (e) =>
        !serverIds.has(e.id) &&
        !p.deleted.has(e.id) &&
        (!(e.refId && serverDocIds.has(e.refId)) ||
          (e.refId != null && voidRefIds.has(e.refId)))
    );
    next.ledgerEntries = [...out, ...kept];
  }
  return next;
}

/** Persist a last-good snapshot of each collection for offline viewing. */
export async function snapshotState(state: AppState): Promise<void> {
  const snap: Record<string, unknown> = {
    parties: state.parties,
    invoices: state.invoices,
    receipts: state.receipts,
    ledgerEntries: state.ledgerEntries,
    purchases: state.purchases,
    expenses: state.expenses,
    generalEntries: state.generalEntries,
    orders: state.orders,
    vehicles: state.vehicles,
    trips: state.trips,
    inventory: state.inventory,
    accounts: state.accounts,
    employees: state.employees,
    dayClosing: state.dayClosing,
    todayMandiRate: state.todayMandiRate,
  };
  for (const [k, v] of Object.entries(snap)) {
    try {
      await saveSnapshot(k, v);
    } catch {
      /* ignore */
    }
  }
}
