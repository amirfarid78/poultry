# Data & Offline-Sync Architecture — Murgh Mandi ERP

Date: 2026-10-10. Stack: Vite + React 19 + TS, `@supabase/supabase-js@2.117.3`
(anon key + user JWT), `idb@8.0.4` for IndexedDB, `bun` for installs.

Files: `src/lib/db.ts` (Supabase data-access), `src/lib/offline.ts` (IndexedDB),
`src/lib/sync.ts` (sync engine), `src/hooks/useSyncStatus.ts` (React binding),
`src/components/common/SyncBadge.tsx` (navbar indicator).

## 1. Source-of-truth rules

1. **The Supabase Postgres database is the source of truth.** The client is a
   cache + write queue; it never decides balances.
2. **`ledger_entries` is never written by the client.** Two `BEFORE INSERT`
   triggers own it:
   - `process_invoice_ledger()` — on `invoices` INSERT: computes
     `previous_balance` / `new_balance`, posts the `invoice` (+ optional
     `invoice_payment`) ledger rows, and updates `parties.current_balance`.
   - `process_receipt_ledger()` — on `receipts` INSERT: same for receipts
     (`receipt` / `supplier_payment` rows).
3. **Balances come from the server.** After `insertInvoice` / `insertReceipt`,
   `db.ts` re-fetches the row, its ledger rows (`ref_id = <id>`), and the party,
   and returns all three so the caller reconciles against server-computed
   values instead of trusting client math. `previous_balance` / `new_balance`
   are **not** sent on invoice/receipt inserts (the trigger computes them).
4. **Exception:** `purchases` has no ledger trigger, and its
   `previous_balance` / `new_balance` columns are `NOT NULL` with no default —
   so the client **does** send them for purchases (taken from the app object).
5. **Conflict rule — last-write-wins, server wins on re-fetch.** Outbox replay
   uses `upsert` on the row's unique key, so the most recently replayed offline
   write overwrites older server state for that key. After every sync the
   client re-fetches, so whatever the server holds is what the UI shows. There
   is no field-level merge: two devices editing the same row resolve to
   "whoever reached the server last wins".

## 2. Outbox format (`mm_outbox` store, IndexedDB `murgh-mandi-erp` v1)

```ts
{
  id: string;              // queue id (random UUID, keyPath)
  op: 'insert' | 'update' | 'delete' | 'upsert';
  table: string;           // server table, e.g. 'invoices'
  payload: object;         // camelCase APP object (e.g. an Invoice)
  idempotency_key: string; // entity id (client-generated UUID)
  created_at: string;      // ISO; queue order
  attempts: number;        // incremented on each failed replay
  last_error: string | null;
}
```

Second store `mm_cache`: `{ key, data, updated_at }` — snapshots such as the
last good `fetchAll()` result, used to bootstrap the UI offline.

## 3. Replay semantics (`src/lib/sync.ts`)

`startSyncEngine(client)` → `{ getStatus(), subscribe(fn), syncNow() }`
(singleton; first call wins). Status:

```ts
{ isOnline, isSyncing, pendingCount, lastSyncAt: string | null, lastError: string | null }
```

- Listens to `window` `online`/`offline`; runs `syncNow()` on `online`.
- 30 s interval: refreshes `pendingCount`, syncs when online.
- `syncNow()` replays oldest-first:
  - `insert`/`upsert` → `upsert(row, { onConflict })`. Conflict targets:
    `id` for UUID tables; `code` for `products`; `market_date,city` for
    `mandi_rates`; `closing_date` for `day_closings`; `trip_pings` is
    append-only (BIGSERIAL) → plain `insert`.
  - `update` → `update(row minus id).eq('id', id)`.
  - `delete` → `delete().eq('id', id)`.
  - `journal_entries` → `insertJournalEntry` (resolves account codes to ids,
    inserts debit/credit lines); a duplicate-key error means "already synced"
    and the entry is dropped.
- Payloads are camelCase; `mapToDbRow(table, payload)` in `db.ts` converts to
  snake_case rows (shared by the online writers and the engine).
- A failing entry does **not** abort the run: `attempts`/`last_error` are
  recorded and replay continues with the rest. `lastError` on the status
  reflects the most recent failure of the last run.

## 4. camelCase ↔ snake_case mapping (`src/lib/db.ts`)

- Fetchers (`fetchParties`, `fetchInvoices`, … `fetchProfiles`) return app types
  from `src/types/index.ts`; NUMERIC → `number`, dates → ISO strings.
- Denormalized app fields (e.g. `Invoice.customerName`, `OrderItem.bookerName`,
  `Purchase.supplierName`) are filled via PostgREST embedded joins
  (`customer:parties!invoices_customer_id_fkey(name,urdu_name)` etc.).
- `Trip.path` / current location are rebuilt from `trip_pings`;
  `Trip.deliveredKg = totalLoadKg − shortageKg` (no `delivered_kg` column
  exists); `Trip.stops` has no server table and comes back empty.
- `fetchAll()` loads every collection in parallel and returns
  `Partial<AppState>`; `todayMandiRate` = latest Lahore `mandi_rates` row,
  `dayClosing` = latest `day_closings` row (omitted when none).
- Writers (`insertParty`, `updateParty`, `insertInvoice`, `insertReceipt`,
  `insertPurchase`, `insertExpense`, `insertOrder`, `updateOrderStatus`,
  `insertTripPing`, `upsertProducts`, `insertMandiRate`,
  `insertEmployeeAdvance`, `upsertDayClosing`, `insertJournalEntry`,
  `insertWhatsappLog`) take camelCase app objects, use their client-generated
  `id` as the PK, and map to snake_case rows. Generated columns
  (`margin_per_40kg`, `net_weight_kg`, `cash_variance`) and trigger-computed
  columns are never sent.

## 5. What localStorage remains for

- `loadSavedState()` / `saveStateToStorage()` in `src/services/store.ts` stay as
  the **offline bootstrap cache**: until the first successful `fetchAll()`, the
  app renders the seed/localStorage state.
- After the first successful fetch, the canonical flow is:
  `fetchAll()` → render → `saveSnapshot('app-state', partial)` (IndexedDB).
  On later offline starts the app should prefer the IndexedDB snapshot over
  stale localStorage (wiring left to the UI integration track).
- localStorage is **not** the write path for server data anymore; all
  mutations go through `db.ts` writers when online, or `enqueueWrite()` when
  offline.

## 6. Role/RLS notes for client developers

- RLS is per-role; the anon key rides with the user's JWT. Expect 403s for
  actions outside the role (e.g. a `driver` inserting invoices) — the sync
  engine surfaces these as `last_error` on the outbox entry, it does not
  retry forever (attempts are visible for support tooling).
- `profiles` rows are keyed by `auth.users.id`; `created_by` columns are
  `profiles` FKs — the writers omit `created_by` unless a real UUID is
  available, since app objects carry display names there.
- Public `share_token` SELECT policies on `invoices`/`receipts` are preserved
  for customer WhatsApp links; nothing in this layer depends on them.
