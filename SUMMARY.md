# Murgh Mandi — Full-Stack Completion Summary

Date: 2026-10-10 · Repo: `amirfarid78/poultry` · Workdir: `~/workspace/poultry` (not committed, not pushed — per instructions)

## What was built

### 1. Database (live, verified on Supabase project `lkgzuslcdezxthawxmww`)
- Applied `supabase/migrations/20240101000000_initial_poultry_schema.sql` → 21 tables, ledger triggers, RLS enabled.
- Wrote + applied `supabase/migrations/20261010000001_role_based_rls.sql`:
  - `handle_new_user()` trigger on `auth.users` → auto-creates `profiles` row; **first signup becomes `owner`**, rest default to `cashier`.
  - `current_user_role()` SECURITY DEFINER helper (no RLS recursion).
  - `prevent_role_escalation()` trigger — only owners (or direct DB access) can change roles.
  - 64 per-role RLS policies replacing the coarse v1 ones; public `share_token` SELECTs on invoices/receipts kept.
  - Added missing `expenses` table + proper GRANTs (v1 granted nothing).
- Wrote + applied `supabase/migrations/20261010000002_purchase_ledger_trigger.sql` — server-side purchase ledger posting (invoices/receipts already had it).
- **Verified live**: 21 RLS checks across owner/driver/anon roles all pass — invoice insert posts 2 ledger rows and sets balance 4400 via trigger; driver blocked from invoices/employees (42501), can ping only own trips; self role-escalation blocked (P0001); anon can read only share_token invoices. Test users were deleted afterwards, so the next real signup becomes owner.

### 2. Auth (app)
- `src/lib/supabase.ts` — client singleton, clear error if env vars missing.
- `src/context/AuthContext.tsx` — session + profile/role, sign in/up/out.
- `src/components/auth/Login.tsx`, `Signup.tsx` — bilingual email+password forms.
- `src/App.tsx` — auth gate; `?token=` public invoice route works **without login** (anon fetch by share_token); demo role switcher removed; role comes from profile; per-role default tabs + tab guards.
- `src/components/layout/Navbar.tsx` — read-only role badge, nav filtered by `VIEW_PERMISSIONS`, sign-out button, SyncBadge mounted.
- `src/lib/permissions.ts` + `docs/ROLE_MATRIX.md` — the full role matrix (see below).

### 3. Data layer + offline sync (app)
- `src/lib/db.ts` — Supabase access for all 21 collections; camelCase↔snake_case mappers; NUMERIC→number coercion; honors trigger rules (never writes `ledger_entries`, never sends trigger-computed balances).
- `src/lib/offline.ts` — IndexedDB outbox (`mm_outbox`) + snapshot cache (`mm_cache`) via `idb`.
- `src/lib/sync.ts` — engine: replays outbox oldest-first on `online` events + every 30s + manual; idempotent upserts; per-entry error tracking; status subscription.
- `src/hooks/useSyncStatus.ts`, `src/components/common/SyncBadge.tsx` — navbar badge (online/offline, pending count, sync-now).
- `src/lib/remote.ts` — App.tsx integration: UUID normalization for server PKs, `persist()` (enqueue + kick sync), `reconcileState()` (server-wins merge; local ledger rows superseded once the server has the doc), snapshot caching.
- Every mutating handler in `App.tsx` now persists to the outbox; after each sync drain the app re-fetches and reconciles.
- `src/utils/calculations.ts` untouched — all 9 acceptance tests pass.

### 4. Config / docs
- `.env.example` rewritten for Supabase; local `.env` (gitignored) holds the live URL + publishable key.
- `docs/DATA_SYNC.md` — sync architecture; `docs/ROLE_MATRIX.md` — role matrix.
- README deployment section rewritten (migrations in order, first-login owner bootstrap, Vercel env vars, offline behavior).

### 5. Verification
- `tsc --noEmit` clean · `vite build` succeeds · 9/9 calculation acceptance tests pass.

## Role matrix (condensed)

| View / capability | owner | manager | accountant | cashier | order_booker | driver | stock_keeper | auditor |
|---|---|---|---|---|---|---|---|---|
| POS invoicing | ✓ | ✓ | – | ✓ | – | – | – | – |
| Receipts | ✓ | ✓ | ✓ | ✓ | – | – | – | – |
| Orders | ✓ | ✓ | – | ✓ | ✓ | – | – | – |
| Ledger read | ✓ | ✓ | ✓ | ✓ | – | – | – | ✓ |
| Accounting / journals | ✓ | ✓ | ✓ | – | – | – | – | read |
| Purchases / inventory | ✓ | ✓ | ✓ | – | – | – | ✓ | read |
| Fleet / own trips + GPS pings | ✓ | ✓ | – | – | – | own | – | – |
| HR / payroll | ✓ | ✓ | partial | advances | – | – | – | read |
| Manage user roles | ✓ | – | – | – | – | – | – | – |

Full matrix: `docs/ROLE_MATRIX.md`. RLS is the enforcement layer; UI gating is UX only.

## What remains / known limitations
1. **First real user must sign up via the app** (becomes owner). Live UI login flow not yet exercised end-to-end — Supabase's email-send rate limit blocked test signups during implementation; RLS itself was verified at the SQL level instead.
2. **Seed demo data**: after first login the server (even if empty) becomes the source of truth and replaces the local demo dataset. Use Settings → Reset for a local demo.
3. **Journal-entry derived effects** (account balances, party ledger rows for JVs) apply locally only in v1; the journal entry itself syncs.
4. **Driver live GPS**: trip field updates sync; continuous background ping ingestion from the driver app is not yet wired (schema + policies ready).
5. **Conflict rule**: last-write-wins on re-fetch; no field-level merge UI.
6. **Rotate the DB password** that was pasted in chat (Supabase dashboard → Database settings).
7. Deploy: push this workdir to GitHub, import in Vercel, set `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` env vars.
