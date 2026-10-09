-- ============================================================================
-- MURGH MANDI POULTRY ERP: SEED DATA (VERIFIED FROM REFERENCE IMAGES)
-- ============================================================================

-- 1. Chart of Accounts Seed
INSERT INTO chart_of_accounts (account_code, name, urdu_name, category, balance, is_system) VALUES
('1010', 'Cash in Hand (Galla)', 'نقد کیش گلہ', 'asset', 850000.00, true),
('1020', 'Meezan Bank - Current A/C', 'میزان بینک اکاؤنٹ', 'asset', 1450000.00, true),
('1030', 'JazzCash Merchant Wallet', 'جاز کیش مرچنٹ', 'asset', 120000.00, true),
('1040', 'Easypaisa Business Wallet', 'ایزی پیسہ بزنس', 'asset', 85000.00, true),
('1050', 'Accounts Receivable (Customers)', 'گاہکوں سے بقایا جات', 'asset', 650000.00, true),
('1060', 'Live Birds Farm Inventory', 'زندہ مرغ اسٹاک', 'asset', 920000.00, true),
('2010', 'Accounts Payable (Suppliers)', 'سپلائرز کے واجبات', 'liability', 480000.00, true),
('3010', 'Owner Capital', 'مالک کا سرمایہ', 'equity', 2500000.00, true),
('4010', 'Broiler Chicken Sales', 'برائلر چکن فروخت', 'revenue', 0.00, true),
('5010', 'Cost of Birds Purchased (COGS)', 'خریداری لاگت', 'expense', 0.00, true),
('5020', 'Vehicle Fuel & Maintenance', 'گاڑی پیٹرول و مرمت', 'expense', 0.00, true),
('5030', 'Staff Salaries & Daily Expense', 'تنخواہیں و اخراجات', 'expense', 0.00, true);

-- 2. Products
INSERT INTO products (code, name, urdu_name, category, current_weight_kg, current_bird_count, unit_of_measure) VALUES
('BR-LIVE', 'Broiler Live (Farm Fresh)', 'زندہ برائلر مرغی', 'broiler', 6450.00, 3200, 'kg'),
('BR-MEAT', 'Dressed Fresh Meat', 'صاف شدہ چکن گوشت', 'dressed', 420.00, 200, 'kg'),
('DESI-LIVE', 'Desi Aseel Chicken', 'اصیل و دیسی زندہ مرغی', 'desi', 380.00, 240, 'kg'),
('LAYER-EGG', 'Table Eggs (Petis)', 'انڈے پیٹی', 'eggs', 1200.00, 1200, 'crate');

-- 3. Customers (Including Sami Khan from Urdu Khata Image 3)
INSERT INTO parties (id, party_type, name, urdu_name, phone, whatsapp, address, city, opening_balance, current_balance, default_kilo) VALUES
('a0000001-0000-0000-0000-000000000001', 'customer', 'Sami Khan Chicken Shop', 'سمی خان چکن شاپ', '03001234567', '03001234567', 'Shop #14, Main Gol Market, Shadman', 'Lahore', 0.00, 4400.00, 80.00),
('a0000002-0000-0000-0000-000000000002', 'customer', 'Haji Aslam Meat Mart', 'حاجی اسلم میٹ مارٹ', '03219876543', '03219876543', 'Bhatti Gate Chowk', 'Lahore', 50000.00, 78400.00, 120.00),
('a0000003-0000-0000-0000-000000000003', 'customer', 'Malik Brothers Poultry', 'ملک برادرز پولٹری', '03335551234', '03335551234', 'Dharampura Bazar', 'Lahore', 0.00, -11600.00, 80.00),
('a0000004-0000-0000-0000-000000000004', 'customer', 'Sheikh Rasheed Retailer', 'شیخ رشید ریٹیلر', '03456677889', '03456677889', 'Ichhra Main Bazar', 'Lahore', 4000.00, 6800.00, 60.00);

-- 4. Suppliers
INSERT INTO parties (id, party_type, name, urdu_name, phone, whatsapp, address, city, opening_balance, current_balance, default_kilo) VALUES
('b0000001-0000-0000-0000-000000000001', 'supplier', 'Big Bird Poultry Breeders', 'بگ برڈ پولٹری بریڈرز', '04235750000', '03008456789', 'Raiwind Road Farm Area', 'Lahore', 250000.00, 310000.00, 2000.00),
('b0000002-0000-0000-0000-000000000002', 'supplier', 'National Feeds Ltd', 'نیشنل فیڈز لمیٹڈ', '04235900000', '03224455667', 'Multan Road Industrial Area', 'Lahore', 100000.00, 180000.00, 500.00);

-- 5. Vehicles & Trips
INSERT INTO vehicles (id, plate_number, model, capacity_kg) VALUES
('c0000001-0000-0000-0000-000000000001', 'LES-4412', 'Toyota Hilux 4x4 Poultry Dala', 2200.00),
('c0000002-0000-0000-0000-000000000002', 'RIA-9102', 'FAW Carrier Shehzore Cage Truck', 3800.00);

-- 6. Employees
INSERT INTO employees (employee_code, name, urdu_name, role, phone, monthly_salary, advance_balance) VALUES
('EMP-101', 'Muhammad Tariq', 'محمد طارق (ڈرائیور)', 'driver', '03017778899', 42000.00, 5000.00),
('EMP-102', 'Shahid Mehmood', 'شاہد محمود (آرڈر بکر)', 'order_booker', '03214433221', 38000.00, 0.00),
('EMP-103', 'Zahid Hussain', 'زاہد حسین (منشی / کیشئر)', 'cashier', '03332211445', 48000.00, 2000.00);

-- 7. Mandi Rates Reference Today
INSERT INTO mandi_rates (market_date, city, broiler_rate_per_40kg, layer_rate_per_40kg, desi_rate_per_40kg, notes) VALUES
(CURRENT_DATE, 'Lahore', 12000.00, 9500.00, 18500.00, 'Official Lahore Mandi closing rate');
