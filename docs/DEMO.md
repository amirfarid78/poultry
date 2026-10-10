# Demo Account & Demo Data

## Demo login

- **Email:** `demo@murghmandi.test`
- **Password:** `Demo1234!`
- **Role:** owner (full access to every section)

Use this account to explore the app end to end without touching real business data.
The demo user was created via Supabase Auth; its profile row carries the `owner`
role, so all role-gated sections and the Danger Zone are visible.

## What's in the demo dataset

Seeded from `supabase/seed_demo.sql` (re-run it any time — every INSERT is
`ON CONFLICT DO NOTHING`, so it is safe to run twice):

| Area | Records |
|---|---|
| Parties | 4 customers (Sami Khan, Haji Aslam, Malik Brothers, Bismillah Tikka) + 2 suppliers |
| Invoices | INV-2401, INV-2402 (ledger auto-posted by DB trigger) |
| Receipts | REC-2401 … REC-2404, incl. a supplier advance |
| Ledger | 8 entries, auto-posted by the invoice/receipt triggers |
| Vehicles / Trips | 2 vehicles, 1 ongoing trip |
| Orders | 3 orders (delivered / out for delivery / confirmed) |
| Products | 4 inventory items (live broiler, dressed, feed) |
| Employees | 3 (driver, order booker, cashier) |
| Expenses | 4 sample expenses |
| Chart of accounts | 13 accounts; 3 journal vouchers with lines |
| Mandi rates | 2024-10-06 / 2024-10-07 Lahore |
| Day closing | 2024-10-07 roznamcha |

Demo balances after seeding (computed by the DB triggers, matching the
reference sheets): Sami Khan **4400**, Haji Aslam **6800**,
Malik Brothers **-11600 (Advance)**, Bismillah Tikka **32000**.

## Resetting the demo

- **In the app:** Settings → Danger zone (owner only) → type `DELETE` →
  wipes all business tables but keeps user accounts.
- **From SQL:** run `supabase/seed_demo.sql` again after cleaning, or call
  `SELECT public.clean_all_data();` as an owner.

## Re-running the seed

```bash
# with PG* env vars set (see /tmp/pgdb.mjs header)
node /tmp/pgdb.mjs file supabase/seed_demo.sql
```
