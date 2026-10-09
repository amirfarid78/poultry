# Database Schema & Entity Relationship Diagram (ERD)

## Schema Overview

```
                      +-------------------+
                      |     profiles      |
                      +-------------------+
                                |
                                v
+------------------+   +-------------------+   +--------------------+
|    customers     |<--|     invoices      |-->|   invoice_items    |
+------------------+   +-------------------+   +--------------------+
         |                      |                         |
         v                      v                         v
+------------------+   +-------------------+   +--------------------+
|  ledger_entries  |   |  journal_entries  |   |  stock_movements   |
+------------------+   +-------------------+   +--------------------+
         ^                      ^                         ^
         |                      |                         |
+------------------+   +-------------------+   +--------------------+
|     receipts     |   |   journal_lines   |   |      products      |
+------------------+   +-------------------+   +--------------------+
         ^                      ^                         ^
         |                      |                         |
+------------------+   +-------------------+   +--------------------+
|    suppliers     |   | chart_of_accounts |   |      batches       |
+------------------+   +-------------------+   +--------------------+

                      +-------------------+
                      |      orders       |
                      +-------------------+
                                |
                                v
+------------------+   +-------------------+   +--------------------+
|     vehicles     |<--|       trips       |-->|     trip_pings     |
+------------------+   +-------------------+   +--------------------+
```

## Core Tables
1. `profiles`: User accounts, roles, mobile number, Urdu display name.
2. `customers`: Customer name, Urdu name, phone, WhatsApp number, opening balance, current balance, default kilo (default 80), credit limit, address.
3. `suppliers`: Feed suppliers, chick hatcheries, medicine, bird growers.
4. `products`: Broiler live, broiler dressed, desi murgh, layer, feed bags, vaccines.
5. `invoices`: Sequential invoice number, date, customer_id, mandi_rate, sale_rate, total_weight_kg, bird_count, total_amount, received_cash, received_ac, ac_payment_mode, ac_ref_no, previous_balance, new_balance, vehicle_id, driver_id, status.
6. `ledger_entries`: Single source of truth for all party ledgers (`party_id`, `party_type`, `entry_date`, `detail`, `detail_urdu`, `folio_no`, `debit`, `credit`, `running_balance`, `ref_type`, `ref_id`).
7. `orders` & `order_sheets`: Daily booked orders, route, expected rate, assigned vehicle, status.
8. `vehicles`, `trips`, `trip_pings`: Fleet management, real-time GPS coordinates, speed, timestamps.
9. `chart_of_accounts`, `journal_entries`, `journal_lines`: Double-entry accounting system.
10. `stock_movements`, `batches`: Live bird weight and head counts, shrinkage / weight loss deduction, mortality, feed consumption.
11. `employees`, `attendance`, `payroll`, `employee_advances`: HR, salary slips, advances and recovery.
12. `day_closings` (Roznamcha): Daily cash count, system cash balance, locked status.
