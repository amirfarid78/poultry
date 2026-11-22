# Sync deep dive — 2026-11-22

Live state at start: bundle `index-6b7RiV8w.js` (Nov 11 fix build). Cascade push
landed during the dive (commit `73c14b72`); live bundle is now `index-1Xqyh3lF.js`.
RPC probes (anon key, read-only): `delete_party_cascade` → PGRST202 (migration
NOT run yet — expected, not a bug); `void_invoice` / `edit_ledger_entry` → P0001
role-check (exist). No Realtime added (needs explicit approval).

## Ranked findings

### F1 — Document-number collisions on UNIQUE columns (HIGH)
- `INV-${2400 + invoices.length + 1}` (POSView): length shrinks after cascade
  deletes / fetch truncation (1000 cap) and races across devices → reuses a
  number that still exists → UNIQUE violation → entry goes dead, retry can
  never fix it (same number).
- `REC-${random 1000–9999}` (ReceiptModal): birthday collisions; same dead-end.
- `JV-${random 200–999}` (AccountingView): only 800 values; collision makes
  `insertJournalEntry` throw duplicate-key, which sync.ts treats as
  "already synced" and DROPS → the JV silently vanishes on next refresh
  (plus its local account/party/ledger effects).
- Fix: sequential max+1 numbering via `nextDocNumber()` helper (INV/REC/JV/
  ORD/PUR/EXP); `insertJournalEntry` now distinguishes "row already exists"
  (safe to drop) from "voucher_number belongs to another entry" (rethrow,
  surfaces as failed); missing journal lines are backfilled on replay.
- Residual: two devices creating the same doc type simultaneously while
  offline can still collide (no server-side numbering); the dead-entry pill
  surfaces it, retry cannot fix it — user must void + recreate.

### F2 — Update ops strip nulls: cleared fields never sync (MEDIUM)
`replayOne` update branch stripped null AND undefined. Full-object updates
(parties, orders, trips, vehicles) send null for cleared fields → stripped →
server keeps the old value → next refresh resurrects it ("I cleared the
phone but it came back").
- Fix: update branch strips only undefined; `rowParty`/`rowOrder`/
  `rowVehicle`/`rowTrip`/`rowEmployee` now emit `undefined` for ABSENT fields
  (partial updates stay safe) and `null` for explicitly cleared ones.
  Partial updates in the tree: orders status-only, employee advanceBalance.
- `updateParty` direct writer already kept nulls — replay now matches it.

### F3 — Post-sync refresh gate stalls when the queue never drains (MEDIUM)
App.tsx refreshed from the server only when `pendingCount === 0`. A
void-chained reissue blocked by a dead void (or any long-lived pending entry)
stopped ALL server refreshes for the session — cross-device data never
appeared ("no realtime data"). Fix: refresh on every sync completion;
`reconcileState` already shields pending entries — that is its purpose.

### F4 — getDb() caches a rejected promise forever (MEDIUM)
One transient IndexedDB open failure disabled sync for the whole session.
Fix: reset `dbPromise` on rejection so the next call retries.

### F5 — Quick Business Setup persists stale inventory (MEDIUM)
`handleQuickBusinessSetup` persisted `stateRef.current.inventory`
(pre-setup values) instead of the fresh starting stock → server kept old
stock → next refresh reverted the setup. Fix: persist the computed fresh
inventory (and reset the broiler mirror — see F6 note in code).

### F6 — POS double-submit (MEDIUM)
`handleSave` had no in-progress guard; two taps in one tick created two
invoices with the same number (same `invoices.length`) → one goes dead.
Fix: 1.5s ref-based save lock in `handleSave` (covers both buttons + Ctrl+S).

### F7 — MAX_SYNC_ATTEMPTS = 8 too small for flaky mobile links (LOW-MED)
8 ticks ≈ 4 min of "online but unreachable" quarantined entries. Raised to
24 (~12 min). Dead entries stay manually retryable; the engine continues
past failures either way.

### F8 — fetchAll silent truncation limits (LOW, latent)
invoices/receipts/purchases/expenses/orders 1000, ledger 2000, journal 500.
Past the cap, older docs vanish locally on refresh. Counts could not be
verified (anon key cannot read — RLS). Preventive bump: docs 2000, ledger
5000, journal 1000, trips 100. The cap itself is still a cliff — proper
pagination is a separate job.

### F9 — Seed mandi rate 12000 survives scrub (LOW)
`loadSavedState` kept `parsed.todayMandiRate`; the seed's 12000 persisted
until a successful refresh. Fix: when seed contamination is proven AND the
rate equals the seed value 12000, reset to blank (0).

### F10 — refreshFromServer swallows the error object (LOW)
`catch {}` lost the underlying error. Now logs it (message still surfaced
via `noteSyncProblem`).

### F11 — persist() has no retry (LOW)
Transient enqueue failure → change is local-only and lost on next refresh.
Fix: retry enqueue up to 2 more times with short delays before surfacing.
(Combined with F4. Permanent IDB unavailability still loses the change —
a localStorage-backed fallback queue would be a bigger design decision.)

### Not fixed / notes
- **Multi-tab outbox race (LOW):** two tabs replaying the same outbox —
  upserts/RPCs are idempotent; `trip_pings` plain-INSERT path appears unused
  (pings go direct + Realtime). localStorage last-writer-wins across tabs.
  App is mobile single-tab in practice; no fix.
- **Stock-upsert staleness (LOW, latent):** stock persists are computed from
  `stateRef.current`; two stock mutations in one React batch (no render
  between) would base both on the same stock. Human-speed entry flushes
  between discrete events, so largely theoretical; a mirror cache would add
  its own sync hazards. Not fixed.
- **Orphan local changes:** a change that fails to enqueue (F11 residual) or
  is made while IDB is down lives only in localStorage and is overwritten by
  the next refresh. No boot-time orphan recovery implemented (needs a design
  decision: re-enqueue local UUID docs missing on the server).
- **Seed reset is transient:** "Reset to Demo Seed" shows demo data for
  <30s until the next auto-refresh wipes it. By design of the refresh loop.
- **mm_cache snapshots are write-only:** `snapshotState` writes 15 snapshots
  per refresh; `getSnapshot` has no callers. Harmless dead weight; left alone.
- **Realtime:** not added. If cross-device latency still complains after
  these fixes, Realtime subscriptions for invoices/parties/receipts are the
  next step (needs user approval).

## Verification
- `bun run lint` (tsc --noEmit) clean; `bun run build` green → new bundle
  `index-BY-ALen2.js` (local dist; NOT pushed).
- Scratch verification script `/tmp/sync-verify.ts`: **30/30 checks pass**
  (nextDocNumber max+1 incl. empty-list/cross-9999/non-numeric cases;
  mapToDbRow null semantics for full vs partial party/order/employee
  payloads; loadSavedState seed scrub incl. mandi-rate 12000 → 0 and
  real-state preservation).
- Live probes during the dive: `delete_party_cascade` was PGRST202 at
  20:44 PKT; **migration RUN by the user 20:45 PKT and verified live 20:46
  PKT (P0001 owner-only guard) — cascade is now fully live end-to-end.**
  `void_invoice` / `edit_ledger_entry` exist (P0001 role-check).
- NOT verified live: the fixes themselves need a push + the user's phone
  tests (see parent report for the per-fix scenarios). Journal
  collision/backfill logic verified by code reading only — no live DB write
  was attempted (read-only probes only, per instructions).

## Files changed by this dive (local working tree only — NOT pushed)
- `src/utils/docNumbers.ts` (new), `docs/sync-deep-dive-2026-11-22.md` (new)
- `src/lib/sync.ts`, `src/lib/offline.ts`, `src/lib/remote.ts`, `src/lib/db.ts`,
  `src/App.tsx`, `src/services/store.ts`, `src/components/pos/POSView.tsx`,
  `src/components/ledger/ReceiptModal.tsx`,
  `src/components/accounting/AccountingView.tsx`,
  `src/components/orders/OrdersView.tsx`,
  `src/components/supplier/SupplierView.tsx`,
  `src/components/expenses/ExpensesView.tsx`
- Cascade-delete files untouched (party_deletes, delete_party_cascade
  routing, cascade shielding, handleDeleteParty confirm flow).
