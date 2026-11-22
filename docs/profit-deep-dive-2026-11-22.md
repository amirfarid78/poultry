# Profit deep dive — 2026-11-22

User's example (acceptance test): buy 1 Mann (40 kg) from supplier at
**Rs 12,000**, mandi rate at the time **Rs 15,000** → Rs 3,000 saved by
buying below mandi. Sell at **Rs 20,000** → Rs 5,000 more by selling
above mandi. **Total profit = Rs 8,000 per Mann.** The software only
counted the second half (Rs 5,000).

## 1. Traced profit figures — BEFORE (live bundle index-DwzuGNSe.js)

| Screen / figure | File + line | Formula (before) | Data source |
|---|---|---|---|
| Dashboard KPI 7 "Est. Profit Today" | `DashboardView.tsx:145-152` | Σ today `(saleRatePer40kg − mandiRatePer40kg) × netWeightKg / 40` | invoices only |
| Dashboard 7-day profit trend (grossGain) | `DashboardView.tsx:189-213` | same formula per day; netGain = grossGain − operatingExpenses | invoices + expenses |
| Dashboard KPI 6 "Mandi Rate Spread" | `DashboardView.tsx:115-119` | `avgSaleRate` (all-time) − `todayMandiRate` | invoices + today's rate |
| Reports "Mandi Margin & Profit" tab | `DashboardView.tsx:1040-1070` | today's mandi rate, today's avg sale rate, "Net Margin per Kg" = `(todayAvgSaleRate − todayMandiRate) / 40` | invoices |
| P&L Revenue | `AccountingView.tsx:410` | Σ live invoices `totalAmount` | invoices |
| P&L COGS | `AccountingView.tsx:411` | **Σ ALL purchases `totalAmount`** (every purchase ever) | purchases |
| P&L Gross / Net | `AccountingView.tsx:417-418` | Revenue − COGS; Net = Gross − fuel − salaries − other | as above |
| Balance Sheet farm stock value | `AccountingView.tsx:~450` | BR-LIVE kg × latest invoice `mandiRatePer40kg` / 40 | inventory + invoices |
| Per-invoice profit | `calculations.ts: calculateInvoice` | `marginPer40kg = saleRate − mandiRate` (sale-vs-mandi only) | invoice row |
| Daily Sheet | — | no profit figure shown | — |

## 2. Root cause

Two separate errors, both from using the **mandi rate as the cost basis**:

1. **Dashboard / trend / margin tab:** profit is defined as
   `(sale − mandi) × kg / 40`. That is only the second half of the user's
   model. The first half — buying below mandi — is never counted because
   the actual purchase price is never read. The dashboard never received
   `purchases` at all (`DashboardViewProps` has no purchases field;
   `App.tsx` does not pass it).
2. **P&L COGS = Σ all purchases:** every purchase ever made is charged as
   if it were sold, including stock still sitting in the sheds. Buy 100
   Mann, sell 10 → COGS counts all 100. And because COGS is a lump sum
   with no link to which goods were sold, the (mandi − purchase) saving
   is invisible there too. Mortality (JV Dr 5040 / Cr 1060, valued at
   mandi rate) appears in NO P&L line.

So the app simultaneously **understates** dashboard profit (misses the
purchase saving) and **overstates** P&L cost (charges unsold stock) —
the two screens disagree with each other and both disagree with the user.

## 3. Chosen model — FIFO profit on ACTUAL purchase cost

`profit = sale value − actual purchase cost of the goods sold`,
allocated FIFO (oldest purchase lot first).

- **Lots:** every purchase is a lot: `netWeightKg` (gross − mortality)
  at `ratePer40kg` (cost per kg = rate / 40), ordered by
  `(purchaseDate, createdAt)`. Invoices are processed chronologically
  by `(invoiceDate, createdAt)`. A sale may only consume lots with
  `purchaseDate ≤ invoiceDate` (same-day purchase-then-sale is allowed).
- **Per invoice:** kg sold is allocated slice by slice from the oldest
  eligible lot. For each slice:
  - `cost += kg × lotCostPerKg`
  - `purchaseSaving += (mandiRate − lotRate) × kg / 40` (can be negative
    if bought above mandi — shown honestly)
  - `saleMargin += (saleRate − mandiRate) × kg / 40`
  - `profit = purchaseSaving + saleMargin + charges` where `charges` is
    the invoice's extra charges (labour/loading — service income with no
    purchase cost). `revenue = totalAmount` (bird value + charges).
  - Identity is exact by construction: `revenue − cogs = purchaseSaving
    + saleMargin + charges` (components rounded per invoice, with
    `saleMargin` derived as the remainder so the three parts always sum
    to the displayed profit).
- **No purchase history (sale before any eligible lot, or lots run out):**
  the remaining kg is costed at the invoice's own mandi rate (proxy),
  `purchaseSaving = 0` for that kg, and the invoice is flagged
  `isEstimate` with `estimatedKg`. The UI labels such profit
  "(تخمینہ / estimate)" — never a silently invented purchase rate.
- **Voided sales excluded** (callers pass live invoices; the helper also
  skips `isVoid`). Edited invoices are void + reissue, so only the
  reissue counts.
- **Mortality / shrinkage:** NOT part of COGS (it is not a sale). The
  mortality JV (Dr 5040) is shown as its own P&L expense line, summed
  from `generalEntries` with `debitAccountCode === '5040'`, using the
  recorded JV amount as-is (the JV values mortality at the mandi rate —
  an existing approximation, not re-computed here). Purchase
  `mortalityKg` is already excluded from the lot's `netWeightKg`.
- **Expenses stay separate:** net profit = gross profit − fuel − salaries
  − other expenses − mortality loss.
- **Closing stock (Balance Sheet):** physical BR-LIVE kg valued at the
  weighted-average purchase cost of the *remaining* FIFO lots; if no lots
  remain, the latest purchase rate; if no purchases exist at all, Rs 0
  with an honest note. Mandi rate is never the valuation basis.
- **Mandi rate stays a reference only:** the spread card (KPI 6) and the
  rate cards in the margin tab are unchanged — they show market position,
  not profit.

## 4. Per-screen BEFORE → AFTER

| Screen | Before | After |
|---|---|---|
| Dashboard KPI 7 | Σ(sale−mandi)×kg/40 today | FIFO profit today = purchaseSaving + saleMargin + charges, with a split line underneath ("خرید بچت Rs X + سیل مارجن Rs Y") and an "(تخمینہ)" tag when any kg was estimated; title drops "Est." when fully costed |
| 7-day profit trend | grossGain = Σ(sale−mandi) per day | grossGain = Σ FIFO profit per day (per-invoice rows grouped by date); netGain = grossGain − operatingExpenses (unchanged) |
| KPI 6 spread card | avgSale − todayMandi | UNCHANGED (rate reference, not profit) |
| Margin tab | mandi rate / avg sale rate / "net margin per kg" = (avgSale−mandi)/40 | same two rate cards as reference + real profit per kg + a breakdown strip (purchase saving / sale margin / charges / estimate note) |
| P&L COGS | Σ all purchases | FIFO cost of goods actually sold (all-time) |
| P&L Net | Revenue − COGS − fuel − salaries − other | Revenue − COGS − fuel − salaries − other − mortality (5040 JV) |
| Balance Sheet stock | BR-LIVE kg × latest mandi rate | BR-LIVE kg × residual-lot avg purchase cost (fallbacks: latest purchase rate → 0 + note) |

## 5. Implementation

- `src/utils/calculations.ts`: new pure helper `computeFifoProfit(invoices,
  purchases)` → `{ perInvoice[], totals, closingStock }`. One shared
  computation used by Dashboard, P&L and Balance Sheet so all screens
  agree. No new columns, no migration: purchases already carry
  `ratePer40kg` / `netWeightKg` / `purchaseDate`; invoices already carry
  `saleRatePer40kg` / `mandiRatePer40kg` / `netWeightKg` / `totalAmount` /
  `chargesTotal`.
- `DashboardView.tsx`: new optional `purchases` prop (default `[]`).
- `App.tsx`: pass `purchases={appState.purchases}` to `DashboardView`.
- `AccountingView.tsx`: COGS + mortality line + BS stock valuation from
  the same helper. `generalEntries` and `purchases` props already exist.
- Untouched: cascade-delete, sync engine, RLS/RPC, stats-fix logic
  (`computeTodayKpis`), mortality JV posting.

## 6. Verification

- `bun run lint` (tsc --noEmit) — **clean**. `bun run build` — **green**
  (local bundle `dist/assets/index-rQYYYbjg.js`).
- Scratch verification `/tmp/profit-checks.ts` — **50/50 checks pass**:
  - **T1 (user's exact example):** buy 40 kg @ 12,000, mandi 15,000,
    sell @ 20,000 → profit **8,000** = purchaseSaving **3,000** +
    saleMargin **5,000**, COGS 12,000, not an estimate.
  - **T2 (two lots, sale spanning both):** 40 kg @ 12,000 + 40 kg @
    16,000, sale 60 kg @ 20,000 / mandi 15,000 → COGS 20,000, profit
    10,000 (saving 2,500, margin 7,500), closing stock 20 kg = 8,000.
  - **T3 (no purchase history):** cost = mandi proxy 15,000, profit
    5,000, saving 0, `isEstimate` true, estimatedKg 40.
  - **T4 (voided sale):** excluded — totals unchanged.
  - **T5 (stock carried over):** buy 80 kg, sell 40 kg → COGS 12,000
    (not 24,000); closing stock 40 kg = 12,000.
  - **T6 (sale before purchase date):** cannot consume the later lot —
    first sale estimated, second sale (after the purchase date) real.
  - **T7 (charges):** Rs 500 charges → profit 8,500; identity holds.
  - **T8 (mixed scenario):** saving + margin + charges == profit on
    every row and on totals; 80 kg estimated when lots run out.
  - **T9:** zero-weight purchase/invoice skipped.
  - **T10 (bought above mandi):** @ 18,000 → saving −3,000, margin
    5,000, profit 2,000 — negative saving shown honestly.
- Old formula gone from Dashboard/P&L (grep verified). No other
  consumers of the old figures exist.

## 7. Known remaining (not a bug in the reported figures)

- POS entry-time preview (`POSView.tsx:1040, 1514-1515`) still shows
  `marginPer40kg` / `netMarginTotal` = sale − mandi spread while the
  user types a bill. It has no purchase-lot context in the form, so it
  stays a rate-spread preview labelled "Margin"/"Loss"; the saved
  invoice's profit is FIFO-computed afterwards on Dashboard/P&L.
- Mortality JV amounts are valued at the mandi rate when posted (existing
  behaviour); the P&L mortality line uses the recorded JV amount as-is.

## 8. Files changed (local working tree only — NOT pushed)

- `src/utils/calculations.ts` — new `computeFifoProfit` (+ types).
- `src/components/dashboard/DashboardView.tsx` — `purchases` prop, FIFO
  today profit + split, FIFO 7-day trend, margin tab real profit/kg +
  breakdown strip.
- `src/App.tsx` — passes `purchases` to `DashboardView`.
- `src/components/accounting/AccountingView.tsx` — FIFO COGS, mortality
  (5040) P&L line, Balance Sheet stock at avg purchase cost.
- `docs/profit-deep-dive-2026-11-22.md` — this note.

No migration needed (all fields already exist). No live DB writes.
