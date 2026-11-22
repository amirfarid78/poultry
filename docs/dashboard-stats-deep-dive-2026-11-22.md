# Dashboard stats deep dive — 2026-11-22

Screenshot: `~/workspace/user/media_library/image/FireShot_Capture_030_-_Nawaz_Poultry_-_Poultry_ERP__POS___Khata_System__-__murgh-mandi-poultry.vercel.app.png` (21:00 PKT, affected laptop).
Symptom: all "today" stats read 0 (sales Rs 0 / 0 kg, collections Rs 0, net profit Rs 0,
cash & bank Rs 0, farm stock 0 kg / 0 birds, 7-day operating expenses Rs 0) while the
same page lists real invoices INV-2443…INV-2401 (7 dated today 2026-11-22), real debtors
(Rs 1,143,670 total) and charts with data. User says the other laptop shows the data.
Sync badge in the screenshot: Online, no pending count, no red failed pill, no
'Sync error' chip. Live bundle index-BY-ALen2.js (Nov 22 sync fix).

## What each zero stat reads (DashboardView.tsx)

| Stat | Source in code | Why it can read 0 while invoices are present |
|---|---|---|
| Today's sales Rs / kg | `dayClosing.totalSalesAmount / totalSalesKg` (L~104) | dayClosing is a per-machine accumulator, NOT derived from invoices |
| Today's collections | `dayClosing.totalCollections` (L~106) | same accumulator |
| Est. profit today | `todaySalesKg * (avgSaleRate - todayMandiRate) / 40` | derived from the zero kg above |
| Cash & bank | `accounts` codes 1010/1020/1030/1040 balances | server slice; empty locally + empty/failed fetch = 0 |
| Farm stock kg/birds | `inventory` rows with category 'broiler' | server slice; same as above |
| 7-day operating expenses | `expenses` filtered by date | server slice; same as above |
| Market credit / debtors | `parties.currentBalance` | synced parties slice — present, so non-zero |
| Sales/profit trend charts | `liveInvoices` filtered by `invoiceDate` | synced invoices slice — present, so charts show data |
| Mandi spread | `avgSaleRate` over ALL live invoices | invoice-derived, non-zero |

## Ranked root causes

### R1 — "Today" KPIs read the per-machine dayClosing accumulator (HIGH, certain)
- `dayClosing` accumulates intraday totals ONLY in local memory on the machine
  where the transaction was entered (App.tsx handleSaveInvoice L~559-564,
  receipts L~797-800, voids subtract L~647-652, etc.).
- The server `day_closings` row is written ONLY on explicit roznamcha save
  (AccountingView handleSaveRoznamcha → App.tsx handleUpdateDayClosing →
  persist upsert) or Quick Setup. It is NEVER updated by a sale.
- On every refresh, `reconcileState` does `dayClosing: remote.dayClosing ??
  prev.dayClosing` (remote.ts:221) — unconditional server-wins, NO pending
  shielding, NO date check. So the locally accumulated intraday totals are
  replaced by the stale server row (last saved closing, or nothing) on every
  30s sync tick.
- Net effect: any machine that did not itself enter today's sales shows
  today's sales = 0, while the synced invoices sit right there in the
  reports table. The machine where the sales were entered shows the numbers
  only until its next refresh (or until a roznamcha save persists them).
- The `fetchDayClosing` row is the LATEST by closing_date regardless of
  date (db.ts:761), so even a saved closing is usually yesterday's.
- Fix: derive today's sales/kg/collections from the synced `invoices` and
  `receipts` collections (same source the trend charts already use), with
  the same "today" string the app uses everywhere
  (`new Date().toISOString().split('T')[0]`, i.e. last7DayKeys[6]).
  Collections = customer receipts dated today + receivedCash+receivedAC on
  today's live invoices (mirrors the dayClosing accumulation exactly,
  voided docs excluded). dayClosing stays for the roznamcha cash
  reconciliation only.

### R2 — A failed (or RLS-emptied) collection silently empties a slice (HIGH)
- `fetchAll` (db.ts) catches each collection fetch independently
  (`.catch(() => undefined)`) and omits failed ones — good for resilience,
  but the failure is NEVER surfaced: no noteSyncProblem call, no per-slice
  error, no retry of just that collection. Only an all-collections failure
  throws and shows the red chip.
- Worse: PostgREST returns `[]`, NOT an error, when RLS denies all rows.
  `merge()` then treats `[]` as truth and wipes good local data
  (server-wins with an empty array). The badge stays clean (Online, no
  pill) while slices sit empty — exactly the screenshot state.
- Fix: (a) fetchAll reports WHICH collections failed; refreshFromServer
  surfaces them via noteSyncProblem so the red chip names the stale slices.
  (b) merge() guard: for `accounts` and `inventory` — reference slices the
  app never deletes from (no delete path for either; expenses DO have a
  delete path so they are excluded) — do not replace a non-empty local
  slice with an empty server array when there are no pending deletes for
  that slice. The Danger Zone wipe is unaffected: it resets local state
  explicitly and reloads (dataManagement.ts cleanAllDataAndResetLocal).

### R3 — Server-side COA balances / stock are never maintained by daily flows (MEDIUM, contributing)
- Nothing updates `chart_of_accounts.balance` server-side: no trigger, and
  journal entries update account balances LOCALLY ONLY (App.tsx
  handleAddGeneralEntry maps updatedAccounts but never persists them;
  'chart_of_accounts' is not even in the OutboxTable union — only a
  direct upsert exists in dataManagement.ts for an owner-only UI).
- Stock IS upserted on invoice save (persistInvoiceStock → 'products'
  upsert by code; rowProduct correctly omits non-UUID seed ids), BUT only
  when a broiler row exists locally — `if (broiler)` silently no-ops when
  local inventory is empty (e.g. after the Nov 11 seed scrub dropped the
  seed rows and the server products table was empty). Empty local +
  empty server is then self-perpetuating: no upsert ever recreates the row.
- Consequence: cash/stock on the server can be stale/empty while local
  state on the entering machine looks right, and vice versa. If the live
  `products` / `chart_of_accounts` tables were never seeded with real
  opening values, no client fix can conjure the numbers — a one-time setup
  is needed (Inventory → set BR-LIVE stock; Quick Setup persists it since
  the Nov 22 fix). Verify in Supabase Table Editor: row counts of
  `products` and `chart_of_accounts`, and the latest `day_closings` row.
- NOT fixed in code here (no invented numbers); documented for the parent
  to confirm with the user. The R1/R2 fixes make the dashboard correct
  and diagnosable for everything the server does hold.

### Ruled out
- Date-format mismatch: invoiceDate/receiptDate AND the dashboard's
  last7DayKeys all use the same UTC `toISOString().split('T')[0]`
  convention, so "today" matches the reports table. (PKT-vs-UTC drift
  00:00–05:00 PKT is a pre-existing app-wide quirk, not this symptom —
  screenshot was taken 21:00 PKT.)
- Column-name mismatch: mappers match the schema (products.current_weight_kg,
  chart_of_accounts.balance, expenses.amount); coercion helpers are null-safe.
- RLS role gating: coa_select and products_select allow any authenticated
  user; day_closings/expenses allow owner/manager/accountant/auditor/cashier.
  A restricted role would explain dayClosing+expenses only, not accounts+
  inventory — and the affected laptop is on the owner account anyway.
- Nov 11 / Nov 22 sync changes: git log shows DashboardView KPI code last
  touched Oct (9bda923, 3e0af53); remote.ts merge line unchanged since
  ca71172. The sync fixes did not cause this — they unmasked it: the Nov 22
  fix refreshes on EVERY sync (previously gated on an empty queue), so the
  stale-server-dayClosing overwrite now happens reliably every 30s instead
  of only sometimes.
- Hardcoded pie data (stockPieData 6450/4200/380/450) is demo leftovers, not
  a stat in question — left alone.

## Fixes implemented (local working tree only — NOT pushed)
- `src/utils/calculations.ts` — NEW exported `computeTodayKpis(liveInvoices,
  receipts, todayStr)`: today sales/kg from live invoices dated today;
  collections = customer receipts dated today + receivedCash+receivedAC on
  today's live invoices; voided docs excluded; takes NO dayClosing, so a
  zero/absent closing can never zero the KPIs again.
- `src/components/dashboard/DashboardView.tsx` — uses computeTodayKpis for
  todaySalesAmount/todaySalesKg/todayCollections (R1); `dayClosing` prop
  removed from the interface, destructuring, App.tsx JSX and the now-unused
  DayClosing import (dayClosing is still used by the roznamcha elsewhere).
- `src/lib/db.ts` — fetchAll returns `{ state, failed }` with the names of
  collections whose fetch threw (R2a).
- `src/App.tsx` — refreshFromServer surfaces failed collections via
  noteSyncProblem so the red 'Sync error' chip names them (R2a).
- `src/lib/remote.ts` — merge() keeps a non-empty local `accounts` /
  `inventory` slice when the server returns [] and no deletes are pending
  for that slice (R2b).

## Verification
- `bun run lint` (tsc --noEmit) clean; `bun run build` green (local bundle
  `dist/assets/index-6AGz1rOX.js`).
- Scratch verification `/tmp/dashboard-stats-verify.ts`: **21/21 checks pass.**
  KPI checks (data modeled on the screenshot): 7 invoices dated 2026-11-22
  → sales Rs 306,720 / 732 kg; collections = Rs 15,000 customer receipt
  today + Rs 5,000 cash + Rs 2,000 AC on today's invoices = Rs 22,000;
  2026-11-21 → 34,400 / 80 kg / 8,000; empty lists → 0/0/0; missing amounts
  → 0; voided invoice and supplier/voided/older receipts excluded.
  fetchAll checks (mock PostgREST db): products + chart_of_accounts +
  day_closings failing → failed exactly ['inventory','accounts','dayClosing'],
  those slices omitted, others kept; all-ok → failed []; all-fail still
  throws 'Could not reach the server'. Merge-guard checks: empty server
  accounts/inventory keeps local; pending delete disables the guard; non-empty
  server still wins; expenses and invoices NOT guarded (empty server wipes
  local); local-empty + server-empty stays empty; dayClosing server-wins
  behaviour unchanged.
- NOT verified live: needs push + the user's laptop checks (see parent report).
