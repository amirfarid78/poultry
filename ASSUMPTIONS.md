# ASSUMPTIONS.md - Pakistani Poultry ERP & Khata System

1. **Unit of Measure & Divisor (The "Mann" Rule):**
   - In Pakistani wholesale poultry markets (Mandi), broiler birds are priced per **Mann (40 kg)**.
   - Formula: `Total = round(Rate * Weight_in_KG / 40)`. The divisor is configurable (default 40).
   - Decimal weights (e.g., 81.4 kg) are common on digital scales; calculations round to the nearest Rupee for retail khata, with exact decimals retained in ledger records.

2. **Dual-Credit Reductions:**
   - Both **Wasool (Cash Received)** and **AC Payment (Bank / JazzCash / Easypaisa)** reduce the customer's balance.
   - Formula for running balance: `Current Balance = Previous Balance + Total Sales - Wasool - AC Payment`.
   - A negative balance represents an **Advance (پیشگی رقم)** where the customer has paid ahead of bird deliveries. It is prominently displayed in emerald green with explicit sign and badge.

3. **Mandi Rate Dynamics:**
   - Mandi rate changes every afternoon/evening and differs across cities (e.g., Lahore, Rawalpindi, Faisalabad, Karachi).
   - The Mandi rate field is **always manually entered** on invoices and never hardcoded.
   - The system pre-fills the latest Mandi rate entered today as a convenience suggestion, while allowing instant override.
   - Internal margin = `Sale Rate - Mandi Rate`. Internal margin is visible to Owners/Accountants but stripped from customer WhatsApp messages and customer-facing printouts.

4. **Offline & Low-Bandwidth Operation:**
   - Wholesale poultry markets and remote farm sheds often suffer from intermittent GSM/4G.
   - The client operates as a Progressive Web App (PWA) with client-side reactive storage (IndexedDB/LocalStorage fallback) and sync queues to prevent data loss.
   - Live location pings are throttled (distance-filtered to >= 50 meters or 30-second interval) to preserve phone battery on driver Android devices.

5. **WhatsApp Integration Protocol:**
   - Per requirements, no paid API or Twilio gateway is used.
   - All WhatsApp shares utilize direct deep links: `https://wa.me/923XXXXXXXXX?text=...` (desktop web) and `whatsapp://send` (mobile), normalizing phone numbers from `03XXXXXXXXX` to `923XXXXXXXXX`.
   - Messages embed a unique public link token for instant mobile receipt and ledger viewing.

6. **Ledger Integrity & Append-Only Audit:**
   - Ledgers do not support destructive hard-deletes. Corrections generate reversing ledger adjustments with audit trails.
   - The Urdu Khata follows the traditional layout: `تاریخ (Date) | تفصیل (Detail with kg) | صفحہ (Folio/Page) | نام (Naam / Debit) | جمع (Jama / Credit) | بقایا (Baqaya / Balance)`.
