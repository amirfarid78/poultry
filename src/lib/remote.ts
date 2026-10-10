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
};

function pendingIdsByTable(pending: OutboxEntry[]): Record<string, Set<string>> {
  const map: Record<string, Set<string>> = {};
  for (const e of pending) {
    const key = TABLE_STATE_KEY[e.table];
    if (!key) continue;
    const id = (e.payload as { id?: unknown })?.id;
    if (typeof id !== 'string') continue;
    (map[key] ??= new Set<string>()).add(id);
  }
  return map;
}

/**
 * Server-wins merge. Server collections replace local ones, except locally
 * created docs still sitting in the outbox (not yet replayed).
 * Ledger entries are special: DB triggers own them, so a local entry whose
 * refId now exists on the server is superseded and dropped.
 */
export function reconcileState(
  prev: AppState,
  remote: Partial<AppState>,
  pending: OutboxEntry[]
): AppState {
  const byTable = pendingIdsByTable(pending);
  const merge = <T,>(
    local: T[],
    server: T[] | undefined,
    stateKey: string,
    getId: (r: T) => string
  ): T[] => {
    if (!server) return local;
    const pids = byTable[stateKey];
    const serverIds = new Set(server.map(getId));
    const kept = pids
      ? local.filter((r) => pids.has(getId(r)) && !serverIds.has(getId(r)))
      : [];
    return [...server, ...kept];
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
    const serverDocIds = new Set<string>();
    for (const e of remote.ledgerEntries) if (e.refId) serverDocIds.add(e.refId);
    const serverIds = new Set(remote.ledgerEntries.map((e) => e.id));
    next.ledgerEntries = [
      ...remote.ledgerEntries,
      ...prev.ledgerEntries.filter(
        (e) => !serverIds.has(e.id) && !(e.refId && serverDocIds.has(e.refId))
      ),
    ];
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
