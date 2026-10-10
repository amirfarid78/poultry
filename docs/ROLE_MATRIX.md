# Role Matrix — Murgh Mandi ERP

Source of truth for access control: `supabase/migrations/20261010000001_role_based_rls.sql`.
**RLS in Postgres is the real security boundary.** UI gating (`src/lib/permissions.ts`,
role badges, hidden nav tabs) is user experience only and must never be relied on for security.

Roles: `owner` · `manager` · `accountant` · `cashier` · `order_booker` · `driver` · `stock_keeper` · `auditor`

## Auth bootstrap

- Email + password via Supabase Auth.
- `handle_new_user()` trigger on `auth.users` auto-creates a `profiles` row.
  The **first** profile on the project becomes `owner`; everyone else defaults to `cashier`
  until an owner assigns their real role.
- `prevent_role_escalation()` trigger: only `owner` (or direct DB/service access) can change roles.

## UI views per role

| View            | owner | manager | accountant | cashier | order_booker | driver | stock_keeper | auditor |
|----------------|:-----:|:-------:|:----------:|:-------:|:------------:|:------:|:------------:|:-------:|
| Dashboard      |   ✓   |    ✓    |     ✓      |    ✓    |      ✓       |   ✓    |      ✓       |    ✓    |
| POS / Billing  |   ✓   |    ✓    |            |    ✓    |              |        |              |         |
| Expenses       |   ✓   |    ✓    |     ✓      |    ✓    |              |        |              |         |
| Customer Khata |   ✓   |    ✓    |     ✓      |    ✓    |              |        |              |    ✓    |
| Daily Sheet    |   ✓   |    ✓    |     ✓      |    ✓    |              |        |              |         |
| Receipt entry  |   ✓   |    ✓    |            |    ✓    |              |        |              |         |
| Suppliers      |   ✓   |    ✓    |     ✓      |         |              |        |      ✓       |         |
| Orders         |   ✓   |    ✓    |            |    ✓    |      ✓       |        |              |         |
| Fleet          |   ✓   |    ✓    |            |         |              |   ✓    |              |         |
| Inventory      |   ✓   |    ✓    |            |         |              |        |      ✓       |         |
| Accounting     |   ✓   |    ✓    |     ✓      |         |              |        |              |         |
| HR             |   ✓   |    ✓    |            |         |              |        |              |         |
| Tests          |   ✓   |         |            |         |              |        |              |         |
| Settings       |   ✓   |    ✓    |            |         |              |        |              |         |

Default landing tab: owner/manager/accountant/auditor → Dashboard · cashier → POS ·
order_booker → Orders · driver → Fleet · stock_keeper → Inventory.

## Database capabilities per role (RLS)

| Capability | owner | manager | accountant | cashier | order_booker | driver | stock_keeper | auditor |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Read parties / products / rates / vehicles | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Create-update parties | ✓ | ✓ | ✓ | ✓ | ✓ | – | ✓(suppliers) | – |
| Create invoices (POS) | ✓ | ✓ | – | ✓ | – | – | – | – |
| Create receipts (payments) | ✓ | ✓ | ✓ | ✓ | – | – | – | – |
| Create-update orders | ✓ | ✓ | – | ✓ | ✓ | – | – | – |
| Read ledger | ✓ | ✓ | ✓ | ✓ | – | – | – | ✓ |
| Manual ledger adjustments | ✓ | ✓ | ✓ | – | – | – | – | – |
| Chart of accounts / journals | ✓ RW | ✓ RW | ✓ RW | – | – | – | – | R |
| Purchases (supplier) | ✓ | ✓ | ✓ | – | – | – | ✓ | R |
| Expenses | ✓ | ✓ | ✓ | create | – | – | – | R |
| Day closing (roznamcha) | ✓ | ✓ | ✓ | ✓ | – | – | – | R |
| HR: employees / payroll | ✓ | ✓ RW | R / RW payroll | advances create | – | – | – | R |
| Trips: manage | ✓ | ✓ | R | – | – | own only | – | R |
| Trip GPS pings: append | ✓ | ✓ | – | – | – | own trips | – | R |
| User profiles: manage roles | ✓ | R | – | self | self | self | self | – |
| Audit / WhatsApp logs | ✓ | ✓ R | – | – | – | – | – | ✓ R |

R = read-only · RW = read + write · – = no access

Additional rules:
- `ledger_entries`, `trip_pings`, `audit_logs` are **append-only** (no UPDATE/DELETE for any role).
- Invoices are never hard-deleted; void via the `is_void` flag (manager+).
- Public invoice/receipt share links (`?token=`) work **without login** via the
  `share_token` SELECT policies (unguessable 32-hex tokens).
- `day_closings.is_locked` rows are authoritative once locked by a manager/owner.
