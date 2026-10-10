# Murgh Mandi (مرغ منڈی) - Pakistani Poultry Sales ERP, POS & Khata System

A production-ready, full-stack Enterprise Resource Planning (ERP), Point of Sale (POS), Traditional Urdu Khata Ledger, Order Booking, and Fleet Tracking software designed specifically for wholesale chicken businesses, poultry farms, and mandi traders in Pakistan.

---

## 1. Verified Mathematical Engine (From the 3 Reference Images)

The system adheres strictly to the formulas extracted from the reference images:

1. **The 40 Kg Mann Rule:**
   - Chicken in Pakistani Mandis is quoted per **Mann (40 kg)**.
   - `Total Amount = round(Rate * Weight_in_KG / 40)`
2. **Dual-Credit Reductions:**
   - Reductions consist of **Wasool (نقد وصولی - Cash)** and **AC Payment (بینک یا اکاؤنٹ ادائیگی - Bank/Digital)**.
   - `Running Balance = Previous Balance + Total - Wasool - AC Payment`
3. **Advance Balances (پیشگی رقم):**
   - A negative balance represents an advance where the customer has deposited money ahead of deliveries. It is prominently displayed with explicit negative signs and an emerald green Advance badge (`-Rs 11,600 (Advance)`).
4. **Mandi Margin Benchmark:**
   - The Mandi rate is manually entered every afternoon/evening and never hardcoded.
   - Internal margin = `Sale Rate - Mandi Rate` (visible only to Owner/Accountant, hidden from customer-facing WhatsApp shares and thermal printouts).

### Acceptance Test Suite (All 5 Passed):
- **Row 1:** Opening 0 -> Sale: rate 12,200, kg 80 -> Total 24,400, Wasool 20,000 -> **Balance 4,400**.
- **Row 2:** Prev 4,400 -> Sale: rate 12,000, kg 80 -> Total 24,000, Wasool 20,000 -> **Balance 8,400**.
- **Row 3:** Payment only 20,000 -> **Balance -11,600 (Advance)**.
- **Handwritten Example:** Prev 4,000 -> Sale: rate 13,200, kg 60 -> Total 19,800, Wasool (C) 9,000, AC (B) 8,000 -> **Balance 6,800**.

---

## 2. Core Modules Included

1. **POS & Counter Sale Entry:**
   - Fast keyboard navigation (Enter moves to next field, `Ctrl+S` saves, `Ctrl+P` prints).
   - Live invoice preview updating as you type.
   - Rate loss warning (`Sale Rate < Mandi Rate`).
   - One-click Save & WhatsApp share.
2. **Dual-Layout Customer Ledger:**
   - **Traditional Urdu Khata Layout** (Exact clone of Image 3): `تاریخ | تفصیل (بشمول کلو) | صفحہ | نام (Debit) | جمع (Credit) | بقایا (Balance)`.
   - **Modern Data Table** with date filtering, aging analysis (0-7, 8-15, 16-30, 30+ days), and CSV export.
3. **WhatsApp Sharing (No Paid API Required):**
   - Direct web link integration `https://wa.me/923XXXXXXXXX?text=...`.
   - Pakistani phone normalizer: automatically formats `03001234567` to `923001234567`.
   - Includes secure read-only unguessable token link for customers.
4. **Order Booking & Consolidated Daily Order Sheets:**
   - Mobile-first order booker interface for field agents.
   - Consolidated daily route sheet with total required kg and vehicle allocation.
   - One-click convert order into sale invoice.
5. **Fleet Management & Live Map (OpenStreetMap + Leaflet):**
   - Real phone Geolocation API broadcast with battery throttle (`distanceFilter: 50m`).
   - Interactive live map of vehicles, delivery routes, polyline trail, speed, and stop completion.
6. **Farm Inventory & Mortality:**
   - Live bird head counts and total kg.
   - Shrinkage (جھاڑ) and mortality deduction logs.
7. **Double-Entry Accounting & Roznamcha:**
   - Pakistan chart of accounts.
   - Daily cash closing (Roznamcha): Physical cash count vs system cash with variance detection and lock override.
   - Profit & Loss with **Profit per Kg** and Mandi margin breakdown.
8. **HR & Staff Payroll:**
   - Driver and booker salary slips and advance loan recovery khata.

---

## 3. Step-by-Step Deployment Instructions

### A. Supabase Database Setup
1. Create a new project at [supabase.com](https://supabase.com) (or use the existing one).
2. Go to the **SQL Editor** in your Supabase dashboard and run, **in order**:
   1. `/supabase/migrations/20240101000000_initial_poultry_schema.sql` — 21 tables, ledger triggers, RLS.
   2. `/supabase/migrations/20261010000001_role_based_rls.sql` — auth bootstrap trigger, per-role RLS policies, `expenses` table, grants.
   3. `/supabase/migrations/20261010000002_purchase_ledger_trigger.sql` — server-side purchase ledger posting.
3. Do **NOT** run `/supabase/seed.sql` on the live database — it is demo data for local UI development only.
4. Copy your **Project URL** and **Publishable (anon) API Key** from `Project Settings → API`.

### B. First Login & Roles
1. Open the deployed app and **Sign up** with your email. The **first account becomes the Owner** automatically (DB trigger); later signups default to Cashier until the owner assigns their real role.
2. Owners manage staff roles from user profiles. Roles: owner, manager, accountant, cashier, order_booker, driver, stock_keeper, auditor — see [docs/ROLE_MATRIX.md](docs/ROLE_MATRIX.md).
3. Row-level security is enforced in Postgres; the UI additionally hides views a role cannot use.

### C. Environment Configuration
Local dev — create a `.env` file in the root (gitignored; see `.env.example`):
```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-publishable-or-anon-key
```

> Never put the `service_role` key, the Postgres connection string, or the DB
> password in the frontend or in git. Those are only for running migrations.

### D. Deploy to Vercel
1. Import your GitHub repository at [vercel.com](https://vercel.com) (or `vercel --prod` from this folder).
2. The included `vercel.json` already handles SPA rewrites.
3. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` under **Settings → Environment Variables**.
4. Build command: `npm run build` (or `bun run build`) | Output directory: `dist`.

### E. Offline Mode
The app is an offline-capable PWA: writes are applied instantly to the local UI and queued in an IndexedDB outbox, then replayed to Supabase when connectivity returns (navbar badge shows pending count). Server-side ledger triggers are authoritative — after each sync the app re-fetches and reconciles, so balances always converge to the server truth. See [docs/DATA_SYNC.md](docs/DATA_SYNC.md).

---

## 4. User Manual (مختصر یوزر مینوئل)

### English:
- **Creating a Sale:** Go to POS, select customer, type today's Mandi rate and sale rate, enter net kg. Cash received is entered in Wasool; bank transfers in AC Payment. Hit `Ctrl+S` or click *Save & WhatsApp*.
- **Traditional Khata:** Click *Customer Khata*, choose Sami Khan, and switch between *Urdu Khata Layout* and *Modern Table*. Click *Print* or *Share on WhatsApp*.
- **Fleet Tracking:** Click *Fleet & Live Map*. As a driver, tap *Start Trip* to begin live GPS broadcasting.
- **Roznamcha:** Click *Roznamcha & Accounts*, enter physical cash counted in the safe, and click *Lock Day Closing*.

### اردو (Urdu):
- **سیل انوائس بنانا:** کاؤنٹر پینل میں گاہک منتخب کریں، منڈی ریٹ اور اپنا سیل ریٹ فی 40 کلو درج کریں۔ کلو گرام وزن لکھیں، نقد وصولی اور بینک وصولی درج کر کے "محفوظ کریں اور واٹس ایپ" پر کلک کریں۔
- **روایتی بہی کھاتہ:** کسٹمر کھاتہ رجسٹر پر کلک کریں اور روایتی اردو کھاتہ پر جائیں۔ ہو بہو پرانی کتاب کی طرح نام، جمع اور بقایا کا پرنٹ اور واٹس ایپ شیئر حاصل کریں۔
- **لائیو ٹریکنگ:** ڈرائیور فون سے "ٹرپ شروع کریں" دبائے گا اور مالک لائیو نقشے پر گاڑی کا راستہ اور کلو گرام ڈیلیوری دیکھ سکتا ہے۔
- **روزنامچہ:** روزانہ شام کو کیش گلہ کاؤنٹ کر کے سسٹم سے موازنہ کریں اور دن کو لاک کر دیں۔
