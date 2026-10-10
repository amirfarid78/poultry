# Offline / Online Sync — Manual Test Plan

Goal: prove the app works fully offline and syncs perfectly when the
internet returns, with no duplicates and no data loss.

## Setup

1. Log in as the demo owner (`demo@murghmandi.test` / see `docs/DEMO.md`).
2. Wait for the sync badge in the navbar to show **Online** with no pending count.
3. Note current counts: e.g. Invoices list length, Expenses list length.

## Test 1 — Go offline, create records

1. Turn on airplane mode (or disconnect Wi-Fi).
2. Confirm the navbar badge switches to **Offline** (red dot).
3. Create a new **POS invoice** for any customer (note the invoice number).
4. Add a new **expense** (note the expense number).
5. Create a new **order** from the Orders view.
6. Expected:
   - All three appear immediately in their lists (optimistic local UI).
   - The sync badge shows **N pending** (N ≥ 3) and stays red/offline.
   - Reload the page while still offline → records are still there
     (IndexedDB outbox + snapshot cache).

## Test 2 — Reconnect, verify sync

1. Turn airplane mode off.
2. Expected within ~30 seconds (or tap the badge's sync button):
   - Badge flips to **Online**, pending count drains to **0**.
   - No error toast appears.
3. Reload the page → the three records are still present exactly once.

## Test 3 — No duplicates

1. In Supabase Dashboard → Table Editor, check:
   - `invoices`: the new invoice number appears **once**.
   - `expenses`: the new expense number appears **once**.
   - `orders`: the new order number appears **once**.
   - `ledger_entries`: the invoice produced its debit + payment credit rows.
2. In the app, the customer ledger for the invoiced party shows the new
   entries with correct running balances.

## Test 4 — Offline edit, then online

1. Go offline, edit an existing party's phone number.
2. Go online, wait for sync.
3. Reload → the edited phone number persists (last-write-wins).

## Test 5 — Kill app mid-queue (robustness)

1. Go offline, create an invoice.
2. Close the browser tab completely.
3. Reopen the app (still offline) → invoice still listed, still pending.
4. Go online → it syncs.

## Pass criteria

- [ ] All offline-created records sync exactly once (no duplicates in DB).
- [ ] Balances/ledger rows are trigger-consistent after sync.
- [ ] Pending badge accurately reflects the outbox count at all times.
- [ ] A failed single record (e.g. validation error) does not block the
      rest of the queue — check the record's `last_error` in IndexedDB
      (`murgh-mandi-erp` → `mm_outbox`) if needed.

## Troubleshooting

- Badge stuck on pending: open DevTools → Application → IndexedDB →
  `murgh-mandi-erp` → `mm_outbox` and read `last_error` on the entry.
- To start a test from a clean slate: Settings → Danger zone (owner) →
  type `DELETE`. This wipes business tables AND local caches.
