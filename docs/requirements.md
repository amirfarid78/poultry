# Poultry Sales ERP + POS + Khata System: Requirements & Analysis

## 1. Reference Material Analysis

### Reference Image 1: Google Sheet (Current Digital Method)
- **Columns (RTL in Urdu):**
  `تاریخ (Date) | Mandi | Rate | Kilo | کل رقم (Total) | وصول (Received) | بقایا جات (Balance) | اکاؤنٹ سے ادائیگی (Payment from account)`
- **Key observations:**
  - Row 1: Mandi (12000), Rate 12200, Kilo 80 -> Total = `12200 * 80 / 40 = 24400`. Received = 20000. Balance = `24400 - 20000 = 4400`.
  - Row 2: Mandi (12000), Rate 12000, Kilo 80 -> Total = `12000 * 80 / 40 = 24000`. Received = 20000. Balance = `4400 + 24000 - 20000 = 8400`.
  - Row 3: Payment only (no sale kg). Received = 20000. Balance = `8400 - 20000 = -11600` (Negative balance = **Advance / پیشگی رقم**).

### Reference Image 2: Handwritten Formula Logic
- Header: Book Name, Customer name, Contact number, WhatsApp number, "WhatsApp share".
- Columns:
  - `A`: Balance (Formula)
  - `B`: AC Payment (Bank/Digital received)
  - `C`: Received / Wasool (Cash received)
  - `D`: Total = `(F * E) / 40`
  - `E`: Kilo (Manual weight)
  - `F`: Rate per 40 kg (Manual selling rate)
  - `G`: Mandi rate (Manual market benchmark)
  - `H`: Date (Auto)
- **Verified Balance Formula:**
  `A(this row) = A(previous row) + D - C - B`
  - Example Row 2: `24400 - 20000 - 400 = 4000`.
  - Example Row 3: `4000 + 19800 - 9000 - 8000 = 6800` (rate 13200, kg 60 -> total 19800). Matches handwritten proof.

### Reference Image 3: Traditional Urdu Khata Book ("کھاتہ بنام ... سمی خان")
- RTL ledger columns:
  - `تاریخ (Date)`
  - `تفصیل (Detail, e.g. "kg 148", "نقد وصولی", "آن لائن ادائیگی")`
  - `صفحہ (Folio / Page / Ref No)`
  - `نام (Naam = Debit / Customer owes)`
  - `جمع (Jama = Credit / Customer paid)`
  - `بقایا (Baqaya = Running Balance)`
- Carried forward opening balance (سابقہ بقایا) appears prominently at the top.

---

## 2. Acceptance Test Suite Verification Criteria
1. **Initial Zero Balance:** Opening = 0.
   - Sale: Rate = 12200, Weight = 80 kg -> Total = 24400, Wasool = 20000 -> Running Balance = 4400.
2. **Sequential Sale:**
   - Previous Balance = 4400.
   - Sale: Rate = 12000, Weight = 80 kg -> Total = 24000, Wasool = 20000 -> Running Balance = 8400.
3. **Payment-Only Voucher:**
   - Previous Balance = 8400.
   - Wasool = 20000 -> Running Balance = -11600 (Advance / سبز رنگ میں پیشگی).
4. **Handwritten Complex Test:**
   - Previous Balance = 4000.
   - Sale: Rate = 13200, Weight = 60 kg -> Total = 19800.
   - Wasool (C) = 9000.
   - AC Payment (B) = 8000.
   - Running Balance = 4000 + 19800 - 9000 - 8000 = 6800.

---

## 3. Role-Based Access Control (RBAC) Matrix
| Module / Capability | Owner / Admin | Manager | Accountant | Cashier / POS | Order Booker | Driver | Stock Keeper |
|---------------------|:-------------:|:-------:|:----------:|:-------------:|:------------:|:------:|:------------:|
| POS / Sale Entry    | Full          | Full    | View/Create| Full          | -            | -      | -            |
| Cost / Mandi Margin | Visible       | Visible | Visible    | Hidden        | Hidden       | Hidden | Hidden       |
| Customer Ledger     | Full          | Full    | Full       | View/Add      | Own Only     | -      | -            |
| Traditional Khata   | Full          | Full    | Full       | View          | -            | -      | -            |
| Order Booking       | Full          | Full    | View       | Create        | Full (Own)   | -      | -            |
| Fleet Live Map      | Full          | Full    | View       | -             | -            | Ping   | -            |
| Roznamcha / Accounts| Full          | Approve | Full       | Daily Cash    | -            | -      | -            |
| Day Lock Override   | Yes           | No      | No         | No            | No           | No     | No           |
| HR & Payroll        | Full          | View    | Full       | -             | -            | -      | -            |
| Stock / Mortality   | Full          | Full    | View       | -             | -            | -      | Full         |
