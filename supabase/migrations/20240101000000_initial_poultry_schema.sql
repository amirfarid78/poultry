-- ============================================================================
-- MURGH MANDI POULTRY ERP: COMPLETE POSTGRESQL SCHEMA WITH RLS & LEDGER ENGINE
-- ============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. ENUMS
CREATE TYPE user_role AS ENUM (
    'owner',
    'manager',
    'accountant',
    'cashier',
    'order_booker',
    'driver',
    'stock_keeper',
    'auditor'
);

CREATE TYPE party_type AS ENUM ('customer', 'supplier', 'employee');
CREATE TYPE order_status AS ENUM ('booked', 'confirmed', 'loaded', 'out_for_delivery', 'delivered', 'invoiced', 'cancelled');
CREATE TYPE trip_status AS ENUM ('planned', 'ongoing', 'completed', 'cancelled');
CREATE TYPE payment_mode AS ENUM ('cash', 'bank_transfer', 'cheque', 'easypaisa', 'jazzcash', 'adjustment');
CREATE TYPE cheque_status AS ENUM ('pending', 'cleared', 'bounced');
CREATE TYPE account_category AS ENUM ('asset', 'liability', 'equity', 'revenue', 'expense');

-- 2. PROFILES (Extends Supabase auth.users)
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    full_name TEXT NOT NULL,
    urdu_name TEXT,
    phone TEXT,
    role user_role NOT NULL DEFAULT 'cashier',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. PARTIES: CUSTOMERS & SUPPLIERS
CREATE TABLE parties (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    party_type party_type NOT NULL,
    name TEXT NOT NULL,
    urdu_name TEXT,
    phone TEXT,
    whatsapp TEXT,
    address TEXT,
    city TEXT DEFAULT 'Lahore',
    opening_balance NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    current_balance NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    credit_limit NUMERIC(14,2) DEFAULT 200000.00,
    default_kilo NUMERIC(10,2) DEFAULT 80.00,
    cnic TEXT,
    ntn TEXT,
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_parties_type ON parties(party_type);
CREATE INDEX idx_parties_phone ON parties(phone);

-- 4. PRODUCTS & STOCK
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    urdu_name TEXT NOT NULL,
    category TEXT DEFAULT 'broiler',
    current_weight_kg NUMERIC(12,2) DEFAULT 0.00,
    current_bird_count INT DEFAULT 0,
    unit_of_measure TEXT DEFAULT 'kg',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. MANDI BENCHMARK RATES HISTORY
CREATE TABLE mandi_rates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    market_date DATE NOT NULL DEFAULT CURRENT_DATE,
    city TEXT NOT NULL DEFAULT 'Lahore',
    broiler_rate_per_40kg NUMERIC(10,2) NOT NULL,
    layer_rate_per_40kg NUMERIC(10,2),
    desi_rate_per_40kg NUMERIC(10,2),
    notes TEXT,
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unq_mandi_date_city UNIQUE(market_date, city)
);

-- 6. VEHICLES & TRIPS (FLEET)
CREATE TABLE vehicles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plate_number TEXT UNIQUE NOT NULL,
    model TEXT NOT NULL,
    capacity_kg NUMERIC(10,2) NOT NULL DEFAULT 3000.00,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE trips (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trip_number TEXT UNIQUE NOT NULL,
    vehicle_id UUID REFERENCES vehicles(id),
    driver_id UUID REFERENCES profiles(id),
    status trip_status DEFAULT 'planned',
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    start_km NUMERIC(10,2),
    end_km NUMERIC(10,2),
    fuel_expense NUMERIC(10,2) DEFAULT 0.00,
    total_load_kg NUMERIC(10,2) DEFAULT 0.00,
    shortage_kg NUMERIC(10,2) DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE trip_pings (
    id BIGSERIAL PRIMARY KEY,
    trip_id UUID REFERENCES trips(id) ON DELETE CASCADE,
    lat NUMERIC(10,7) NOT NULL,
    lng NUMERIC(10,7) NOT NULL,
    speed NUMERIC(6,2) DEFAULT 0.0,
    heading NUMERIC(6,2),
    battery_level INT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_trip_pings_trip ON trip_pings(trip_id, created_at DESC);

-- 7. ORDERS & ORDER SHEETS
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_number TEXT UNIQUE NOT NULL,
    order_date DATE NOT NULL DEFAULT CURRENT_DATE,
    customer_id UUID REFERENCES parties(id) NOT NULL,
    booker_id UUID REFERENCES profiles(id),
    assigned_trip_id UUID REFERENCES trips(id),
    expected_kg NUMERIC(10,2) NOT NULL,
    expected_bird_count INT,
    quoted_rate_per_40kg NUMERIC(10,2),
    delivery_time_slot TEXT DEFAULT 'Morning (05:00 - 08:00)',
    delivery_route TEXT,
    status order_status DEFAULT 'booked',
    special_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. INVOICES / SALES (THE HEART OF THE SYSTEM)
CREATE TABLE invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_number TEXT UNIQUE NOT NULL,
    fiscal_year TEXT NOT NULL DEFAULT '2024-2025',
    invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
    customer_id UUID REFERENCES parties(id) NOT NULL,
    order_id UUID REFERENCES orders(id),
    product_id UUID REFERENCES products(id),
    vehicle_id UUID REFERENCES vehicles(id),
    driver_id UUID REFERENCES profiles(id),
    mandi_rate_per_40kg NUMERIC(10,2) NOT NULL,
    sale_rate_per_40kg NUMERIC(10,2) NOT NULL,
    margin_per_40kg NUMERIC(10,2) GENERATED ALWAYS AS (sale_rate_per_40kg - mandi_rate_per_40kg) STORED,
    gross_weight_kg NUMERIC(10,2) NOT NULL,
    shrinkage_kg NUMERIC(10,2) DEFAULT 0.00,
    net_weight_kg NUMERIC(10,2) GENERATED ALWAYS AS (gross_weight_kg - shrinkage_kg) STORED,
    bird_count INT DEFAULT 0,
    mann_divisor NUMERIC(6,2) DEFAULT 40.00,
    total_amount NUMERIC(14,2) NOT NULL,
    received_cash NUMERIC(14,2) DEFAULT 0.00,
    received_ac NUMERIC(14,2) DEFAULT 0.00,
    ac_payment_mode payment_mode DEFAULT 'cash',
    ac_ref_no TEXT,
    discount_amount NUMERIC(10,2) DEFAULT 0.00,
    previous_balance NUMERIC(14,2) NOT NULL,
    new_balance NUMERIC(14,2) NOT NULL,
    share_token TEXT UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
    is_void BOOLEAN DEFAULT false,
    void_reason TEXT,
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_invoices_customer ON invoices(customer_id);
CREATE INDEX idx_invoices_date ON invoices(invoice_date);

-- 9. PAYMENT RECEIPTS (VOUCHERS)
CREATE TABLE receipts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    receipt_number TEXT UNIQUE NOT NULL,
    receipt_date DATE NOT NULL DEFAULT CURRENT_DATE,
    party_id UUID REFERENCES parties(id) NOT NULL,
    party_type party_type NOT NULL,
    amount NUMERIC(14,2) NOT NULL,
    payment_mode payment_mode NOT NULL DEFAULT 'cash',
    bank_name TEXT,
    ref_no TEXT,
    notes TEXT,
    previous_balance NUMERIC(14,2) NOT NULL,
    new_balance NUMERIC(14,2) NOT NULL,
    share_token TEXT UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. PURCHASES (SUPPLIER PROCUREMENT)
CREATE TABLE purchases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    purchase_number TEXT UNIQUE NOT NULL,
    purchase_date DATE NOT NULL DEFAULT CURRENT_DATE,
    supplier_id UUID REFERENCES parties(id) NOT NULL,
    product_id UUID REFERENCES products(id),
    rate_per_40kg NUMERIC(10,2) NOT NULL,
    gross_weight_kg NUMERIC(10,2) NOT NULL,
    mortality_kg NUMERIC(10,2) DEFAULT 0.00,
    net_weight_kg NUMERIC(10,2) NOT NULL,
    bird_count INT DEFAULT 0,
    total_amount NUMERIC(14,2) NOT NULL,
    paid_cash NUMERIC(14,2) DEFAULT 0.00,
    paid_bank NUMERIC(14,2) DEFAULT 0.00,
    previous_balance NUMERIC(14,2) NOT NULL,
    new_balance NUMERIC(14,2) NOT NULL,
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. LEDGER ENTRIES (THE SOURCE OF TRUTH FOR RUNNING BALANCES)
CREATE TABLE ledger_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    party_id UUID REFERENCES parties(id) ON DELETE CASCADE NOT NULL,
    entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
    detail TEXT NOT NULL,
    detail_urdu TEXT NOT NULL,
    folio_no TEXT,
    debit NUMERIC(14,2) DEFAULT 0.00,   -- Naam (customer owes us)
    credit NUMERIC(14,2) DEFAULT 0.00,  -- Jama (customer paid us)
    running_balance NUMERIC(14,2) NOT NULL,
    ref_type TEXT NOT NULL, -- 'invoice', 'receipt', 'purchase', 'adjustment', 'opening'
    ref_id UUID,
    is_void BOOLEAN DEFAULT false,
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ledger_party_date ON ledger_entries(party_id, entry_date, created_at);

-- 12. DOUBLE-ENTRY ACCOUNTING: CHART OF ACCOUNTS & JOURNALS
CREATE TABLE chart_of_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    urdu_name TEXT NOT NULL,
    category account_category NOT NULL,
    balance NUMERIC(14,2) DEFAULT 0.00,
    is_system BOOLEAN DEFAULT false
);

CREATE TABLE journal_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    voucher_number TEXT UNIQUE NOT NULL,
    entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
    description TEXT NOT NULL,
    ref_type TEXT,
    ref_id UUID,
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE journal_lines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE CASCADE,
    account_id UUID REFERENCES chart_of_accounts(id),
    debit NUMERIC(14,2) DEFAULT 0.00,
    credit NUMERIC(14,2) DEFAULT 0.00
);

-- 13. HR & EMPLOYEES
CREATE TABLE employees (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    urdu_name TEXT,
    role user_role NOT NULL,
    phone TEXT NOT NULL,
    cnic TEXT,
    monthly_salary NUMERIC(10,2) NOT NULL DEFAULT 35000.00,
    advance_balance NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    joining_date DATE DEFAULT CURRENT_DATE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE employee_advances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID REFERENCES employees(id),
    advance_date DATE DEFAULT CURRENT_DATE,
    amount NUMERIC(10,2) NOT NULL,
    recovery_plan TEXT,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE payroll (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID REFERENCES employees(id),
    month_year TEXT NOT NULL, -- '07-2024'
    basic_salary NUMERIC(10,2) NOT NULL,
    commission NUMERIC(10,2) DEFAULT 0.00,
    advance_deduction NUMERIC(10,2) DEFAULT 0.00,
    net_payable NUMERIC(10,2) NOT NULL,
    is_paid BOOLEAN DEFAULT false,
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 14. DAY CLOSINGS (ROZNAMCHA)
CREATE TABLE day_closings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    closing_date DATE UNIQUE NOT NULL DEFAULT CURRENT_DATE,
    physical_cash_count NUMERIC(14,2) NOT NULL,
    system_cash_balance NUMERIC(14,2) NOT NULL,
    cash_variance NUMERIC(14,2) GENERATED ALWAYS AS (physical_cash_count - system_cash_balance) STORED,
    total_sales_kg NUMERIC(10,2) DEFAULT 0.00,
    total_sales_amount NUMERIC(14,2) DEFAULT 0.00,
    total_recoveries NUMERIC(14,2) DEFAULT 0.00,
    is_locked BOOLEAN DEFAULT true,
    locked_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 15. AUDIT LOG & WHATSAPP LOG
CREATE TABLE whatsapp_share_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recipient_phone TEXT NOT NULL,
    ref_type TEXT NOT NULL,
    ref_id UUID,
    message_snippet TEXT,
    shared_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id),
    action TEXT NOT NULL,
    entity TEXT NOT NULL,
    entity_id UUID,
    old_data JSONB,
    new_data JSONB,
    ip_address TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- POSTGRESQL TRIGGERS FOR LEDGER CONSISTENCY & ATOMIC RUNNING BALANCES
-- ============================================================================

-- Function to handle atomic ledger posting from invoices
CREATE OR REPLACE FUNCTION process_invoice_ledger()
RETURNS TRIGGER AS $$
DECLARE
    cur_bal NUMERIC(14,2);
    tot_rec NUMERIC(14,2);
    calced_new_bal NUMERIC(14,2);
BEGIN
    -- 1. Fetch current balance of party
    SELECT current_balance INTO cur_bal FROM parties WHERE id = NEW.customer_id FOR UPDATE;
    
    tot_rec := COALESCE(NEW.received_cash, 0) + COALESCE(NEW.received_ac, 0);
    calced_new_bal := cur_bal + NEW.total_amount - tot_rec;
    
    NEW.previous_balance := cur_bal;
    NEW.new_balance := calced_new_bal;
    
    -- 2. Insert into ledger_entries (Naam for sale total)
    INSERT INTO ledger_entries (
        party_id,
        entry_date,
        detail,
        detail_urdu,
        folio_no,
        debit,
        credit,
        running_balance,
        ref_type,
        ref_id,
        created_by
    ) VALUES (
        NEW.customer_id,
        NEW.invoice_date,
        CONCAT('Sale: ', NEW.net_weight_kg, ' kg @ Rs ', NEW.sale_rate_per_40kg, '/40kg'),
        CONCAT('مرغ فروخت: ', NEW.net_weight_kg, ' کلو، ریٹ ', NEW.sale_rate_per_40kg),
        NEW.invoice_number,
        NEW.total_amount,
        0,
        cur_bal + NEW.total_amount,
        'invoice',
        NEW.id,
        NEW.created_by
    );
    
    -- 3. If cash or AC payment received, insert credit row in ledger
    IF tot_rec > 0 THEN
        INSERT INTO ledger_entries (
            party_id,
            entry_date,
            detail,
            detail_urdu,
            folio_no,
            debit,
            credit,
            running_balance,
            ref_type,
            ref_id,
            created_by
        ) VALUES (
            NEW.customer_id,
            NEW.invoice_date,
            CONCAT('Payment Recd (Cash: ', NEW.received_cash, ', AC: ', NEW.received_ac, ')'),
            CONCAT('وصولی نقد: ', NEW.received_cash, '، اکاؤنٹ: ', NEW.received_ac),
            NEW.invoice_number,
            0,
            tot_rec,
            calced_new_bal,
            'invoice_payment',
            NEW.id,
            NEW.created_by
        );
    END IF;
    
    -- 4. Update the master current_balance on party
    UPDATE parties SET current_balance = calced_new_bal WHERE id = NEW.customer_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_invoice_ledger
BEFORE INSERT ON invoices
FOR EACH ROW
EXECUTE FUNCTION process_invoice_ledger();

-- Function to handle receipt ledger posting (Payment Only Voucher)
CREATE OR REPLACE FUNCTION process_receipt_ledger()
RETURNS TRIGGER AS $$
DECLARE
    cur_bal NUMERIC(14,2);
    calced_new_bal NUMERIC(14,2);
BEGIN
    SELECT current_balance INTO cur_bal FROM parties WHERE id = NEW.party_id FOR UPDATE;
    
    -- If customer, payment reduces what they owe (credit)
    -- If supplier, payment reduces what we owe them
    IF NEW.party_type = 'customer' THEN
        calced_new_bal := cur_bal - NEW.amount;
        NEW.previous_balance := cur_bal;
        NEW.new_balance := calced_new_bal;
        
        INSERT INTO ledger_entries (
            party_id,
            entry_date,
            detail,
            detail_urdu,
            folio_no,
            debit,
            credit,
            running_balance,
            ref_type,
            ref_id,
            created_by
        ) VALUES (
            NEW.party_id,
            NEW.receipt_date,
            CONCAT('Payment Received (', NEW.payment_mode, ') - Ref: ', COALESCE(NEW.ref_no, '-')),
            CONCAT('رقم وصولی (', NEW.payment_mode, ') - حوالہ: ', COALESCE(NEW.ref_no, '-')),
            NEW.receipt_number,
            0,
            NEW.amount,
            calced_new_bal,
            'receipt',
            NEW.id,
            NEW.created_by
        );
    ELSE
        calced_new_bal := cur_bal - NEW.amount;
        NEW.previous_balance := cur_bal;
        NEW.new_balance := calced_new_bal;
        
        INSERT INTO ledger_entries (
            party_id,
            entry_date,
            detail,
            detail_urdu,
            folio_no,
            debit,
            credit,
            running_balance,
            ref_type,
            ref_id,
            created_by
        ) VALUES (
            NEW.party_id,
            NEW.receipt_date,
            CONCAT('Payment Paid to Supplier (', NEW.payment_mode, ')'),
            CONCAT('سپلائر کو ادائیگی (', NEW.payment_mode, ')'),
            NEW.receipt_number,
            NEW.amount,
            0,
            calced_new_bal,
            'supplier_payment',
            NEW.id,
            NEW.created_by
        );
    END IF;
    
    UPDATE parties SET current_balance = calced_new_bal WHERE id = NEW.party_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_receipt_ledger
BEFORE INSERT ON receipts
FOR EACH ROW
EXECUTE FUNCTION process_receipt_ledger();

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE mandi_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_pings ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE chart_of_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_advances ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll ENABLE ROW LEVEL SECURITY;
ALTER TABLE day_closings ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_share_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Permissive policy for authenticated staff (owner, manager, accountant, cashier)
CREATE POLICY "Authenticated users can read parties" ON parties FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Staff can insert/update parties" ON parties FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can read invoices" ON invoices FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Cashier and above can insert invoices" ON invoices FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can read ledger" ON ledger_entries FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Ledger entries are append-only" ON ledger_entries FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Drivers can send trip pings" ON trip_pings FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Staff can view trip pings" ON trip_pings FOR SELECT USING (auth.role() = 'authenticated');

-- Public share token policy (allows customers to view their invoices and receipts via unguessable token without logging in)
CREATE POLICY "Public invoice view via share token" ON invoices FOR SELECT USING (share_token IS NOT NULL);
CREATE POLICY "Public receipt view via share token" ON receipts FOR SELECT USING (share_token IS NOT NULL);
