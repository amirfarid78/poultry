-- ============================================================================
-- MURGH MANDI ERP: ROLE-BASED ACCESS CONTROL (RLS) + AUTH BOOTSTRAP
-- ============================================================================
-- Roles (user_role enum): owner, manager, accountant, cashier,
--                         order_booker, driver, stock_keeper, auditor
--
-- Design:
--   * RLS is the real security boundary. UI gating is UX only.
--   * public.current_user_role() is SECURITY DEFINER and reads profiles,
--     avoiding RLS recursion.
--   * handle_new_user() trigger on auth.users auto-creates a profiles row.
--     The FIRST profile on the project becomes 'owner'; everyone else
--     defaults to 'cashier' until an owner assigns their real role.
--   * A guard trigger prevents non-owners from changing anyone's role.
--   * Existing public share_token SELECT policies on invoices/receipts
--     are preserved (customer-facing WhatsApp receipt links).
-- ============================================================================

-- --------------------------------------------------------------------------
-- 0. EXPENSES TABLE (used by the app's ExpensesView; missing from v1 schema)
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS expenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    expense_number TEXT UNIQUE NOT NULL,
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    category TEXT NOT NULL,
    category_name TEXT,
    category_urdu_name TEXT,
    amount NUMERIC(14,2) NOT NULL,
    payment_mode payment_mode NOT NULL DEFAULT 'cash',
    vehicle_id UUID REFERENCES vehicles(id),
    description TEXT,
    description_urdu TEXT,
    paid_to TEXT,
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

-- --------------------------------------------------------------------------
-- 1. GRANTS (the v1 migration created tables but granted nothing)
-- --------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
-- anon only needs to read shared invoices/receipts via share_token links
GRANT SELECT ON invoices TO anon;
GRANT SELECT ON receipts TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO authenticated;

-- --------------------------------------------------------------------------
-- 2. ROLE HELPER (SECURITY DEFINER => bypasses RLS, no recursion)
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$;

-- --------------------------------------------------------------------------
-- 3. AUTH BOOTSTRAP: auto-create profile on signup; first user => owner
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_first boolean;
BEGIN
  SELECT NOT EXISTS (SELECT 1 FROM public.profiles) INTO v_is_first;
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email, 'Staff'),
    CASE WHEN v_is_first THEN 'owner'::user_role ELSE 'cashier'::user_role END
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Guard: only owners may change roles (prevents privilege escalation)
CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    -- Direct DB / service_role connections carry no JWT (auth.uid() IS NULL)
    -- and are already fully privileged: allow.
    IF auth.uid() IS NULL THEN
      RETURN NEW;
    END IF;
    IF public.current_user_role() IS DISTINCT FROM 'owner' THEN
      RAISE EXCEPTION 'Only owners can change user roles';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_role_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_role_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_role_escalation();

-- --------------------------------------------------------------------------
-- 4. DROP THE COARSE v1 POLICIES (keep share_token public SELECTs)
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can read parties" ON parties;
DROP POLICY IF EXISTS "Staff can insert/update parties" ON parties;
DROP POLICY IF EXISTS "Authenticated users can read invoices" ON invoices;
DROP POLICY IF EXISTS "Cashier and above can insert invoices" ON invoices;
DROP POLICY IF EXISTS "Authenticated users can read ledger" ON ledger_entries;
DROP POLICY IF EXISTS "Ledger entries are append-only" ON ledger_entries;
DROP POLICY IF EXISTS "Drivers can send trip pings" ON trip_pings;
DROP POLICY IF EXISTS "Staff can view trip pings" ON trip_pings;
-- NOTE: "Public invoice view via share token" and
--       "Public receipt view via share token" are intentionally kept.

-- --------------------------------------------------------------------------
-- 5. PER-ROLE POLICIES
-- Conventions: owner = everything; manager = all operational tables;
-- auditor = read-only everywhere; other roles = least privilege per duty.
-- --------------------------------------------------------------------------

-- ============ PROFILES ============
DROP POLICY IF EXISTS profiles_select ON profiles;
DROP POLICY IF EXISTS profiles_update_owner ON profiles;
DROP POLICY IF EXISTS profiles_update_self ON profiles;
DROP POLICY IF EXISTS profiles_delete_owner ON profiles;

-- owner/manager see everyone; staff see only their own row
CREATE POLICY profiles_select ON profiles FOR SELECT USING (
  public.current_user_role() IN ('owner','manager') OR id = auth.uid()
);
-- owners manage roles / activate accounts
CREATE POLICY profiles_update_owner ON profiles FOR UPDATE USING (
  public.current_user_role() = 'owner'
) WITH CHECK (
  public.current_user_role() = 'owner'
);
-- staff may update their own name/phone (role changes blocked by trigger)
CREATE POLICY profiles_update_self ON profiles FOR UPDATE USING (
  id = auth.uid()
) WITH CHECK (
  id = auth.uid()
);
CREATE POLICY profiles_delete_owner ON profiles FOR DELETE USING (
  public.current_user_role() = 'owner'
);

-- ============ PARTIES (customers & suppliers) ============
DROP POLICY IF EXISTS parties_select ON parties;
DROP POLICY IF EXISTS parties_write_staff ON parties;
DROP POLICY IF EXISTS parties_delete_mgr ON parties;

CREATE POLICY parties_select ON parties FOR SELECT USING (
  auth.role() = 'authenticated'
);
CREATE POLICY parties_write_staff ON parties FOR INSERT WITH CHECK (
  public.current_user_role() IN ('owner','manager','accountant','cashier','order_booker','stock_keeper')
);
-- updates use a separate policy (INSERT policies don't cover UPDATE)
DROP POLICY IF EXISTS parties_update_staff ON parties;
CREATE POLICY parties_update_staff ON parties FOR UPDATE USING (
  public.current_user_role() IN ('owner','manager','accountant','cashier','order_booker','stock_keeper')
) WITH CHECK (
  public.current_user_role() IN ('owner','manager','accountant','cashier','order_booker','stock_keeper')
);
CREATE POLICY parties_delete_mgr ON parties FOR DELETE USING (
  public.current_user_role() IN ('owner','manager')
);

-- ============ PRODUCTS (inventory) ============
DROP POLICY IF EXISTS products_select ON products;
DROP POLICY IF EXISTS products_write_stock ON products;

CREATE POLICY products_select ON products FOR SELECT USING (
  auth.role() = 'authenticated'
);
CREATE POLICY products_write_stock ON products FOR ALL USING (
  public.current_user_role() IN ('owner','manager','stock_keeper')
) WITH CHECK (
  public.current_user_role() IN ('owner','manager','stock_keeper')
);

-- ============ MANDI RATES ============
DROP POLICY IF EXISTS mandi_rates_select ON mandi_rates;
DROP POLICY IF EXISTS mandi_rates_insert ON mandi_rates;
DROP POLICY IF EXISTS mandi_rates_modify_mgr ON mandi_rates;

CREATE POLICY mandi_rates_select ON mandi_rates FOR SELECT USING (
  auth.role() = 'authenticated'
);
CREATE POLICY mandi_rates_insert ON mandi_rates FOR INSERT WITH CHECK (
  public.current_user_role() IN ('owner','manager','accountant','cashier')
);
CREATE POLICY mandi_rates_modify_mgr ON mandi_rates FOR UPDATE USING (
  public.current_user_role() IN ('owner','manager')
) WITH CHECK (
  public.current_user_role() IN ('owner','manager')
);
DROP POLICY IF EXISTS mandi_rates_delete_mgr ON mandi_rates;
CREATE POLICY mandi_rates_delete_mgr ON mandi_rates FOR DELETE USING (
  public.current_user_role() IN ('owner','manager')
);

-- ============ VEHICLES ============
DROP POLICY IF EXISTS vehicles_select ON vehicles;
DROP POLICY IF EXISTS vehicles_write_mgr ON vehicles;

CREATE POLICY vehicles_select ON vehicles FOR SELECT USING (
  auth.role() = 'authenticated'
);
CREATE POLICY vehicles_write_mgr ON vehicles FOR ALL USING (
  public.current_user_role() IN ('owner','manager')
) WITH CHECK (
  public.current_user_role() IN ('owner','manager')
);

-- ============ TRIPS ============
DROP POLICY IF EXISTS trips_select ON trips;
DROP POLICY IF EXISTS trips_write_mgr ON trips;
DROP POLICY IF EXISTS trips_update_driver_own ON trips;

CREATE POLICY trips_select ON trips FOR SELECT USING (
  public.current_user_role() IN ('owner','manager','accountant','auditor')
  OR (public.current_user_role() = 'driver' AND driver_id = auth.uid())
);
CREATE POLICY trips_write_mgr ON trips FOR INSERT WITH CHECK (
  public.current_user_role() IN ('owner','manager')
);
DROP POLICY IF EXISTS trips_update_mgr ON trips;
CREATE POLICY trips_update_mgr ON trips FOR UPDATE USING (
  public.current_user_role() IN ('owner','manager')
) WITH CHECK (
  public.current_user_role() IN ('owner','manager')
);
-- drivers update their own trips (status, kms, fuel)
CREATE POLICY trips_update_driver_own ON trips FOR UPDATE USING (
  public.current_user_role() = 'driver' AND driver_id = auth.uid()
) WITH CHECK (
  public.current_user_role() = 'driver' AND driver_id = auth.uid()
);
DROP POLICY IF EXISTS trips_delete_owner ON trips;
CREATE POLICY trips_delete_owner ON trips FOR DELETE USING (
  public.current_user_role() = 'owner'
);

-- ============ TRIP PINGS (append-only GPS trail) ============
DROP POLICY IF EXISTS trip_pings_select ON trip_pings;
DROP POLICY IF EXISTS trip_pings_insert ON trip_pings;

CREATE POLICY trip_pings_select ON trip_pings FOR SELECT USING (
  public.current_user_role() IN ('owner','manager','accountant','auditor')
  OR (
    public.current_user_role() = 'driver'
    AND EXISTS (SELECT 1 FROM public.trips t WHERE t.id = trip_pings.trip_id AND t.driver_id = auth.uid())
  )
);
CREATE POLICY trip_pings_insert ON trip_pings FOR INSERT WITH CHECK (
  public.current_user_role() IN ('owner','manager')
  OR (
    public.current_user_role() = 'driver'
    AND EXISTS (SELECT 1 FROM public.trips t WHERE t.id = trip_pings.trip_id AND t.driver_id = auth.uid())
  )
);
-- no UPDATE/DELETE: GPS trail is append-only

-- ============ ORDERS ============
DROP POLICY IF EXISTS orders_select ON orders;
DROP POLICY IF EXISTS orders_write_ops ON orders;
DROP POLICY IF EXISTS orders_delete_mgr ON orders;

CREATE POLICY orders_select ON orders FOR SELECT USING (
  auth.role() = 'authenticated'
);
CREATE POLICY orders_write_ops ON orders FOR INSERT WITH CHECK (
  public.current_user_role() IN ('owner','manager','order_booker','cashier')
);
DROP POLICY IF EXISTS orders_update_ops ON orders;
CREATE POLICY orders_update_ops ON orders FOR UPDATE USING (
  public.current_user_role() IN ('owner','manager','order_booker','cashier')
) WITH CHECK (
  public.current_user_role() IN ('owner','manager','order_booker','cashier')
);
CREATE POLICY orders_delete_mgr ON orders FOR DELETE USING (
  public.current_user_role() IN ('owner','manager')
);

-- ============ INVOICES (POS billing) ============
DROP POLICY IF EXISTS invoices_select ON invoices;
DROP POLICY IF EXISTS invoices_insert ON invoices;
DROP POLICY IF EXISTS invoices_update ON invoices;

CREATE POLICY invoices_select ON invoices FOR SELECT USING (
  auth.role() = 'authenticated'
);
CREATE POLICY invoices_insert ON invoices FOR INSERT WITH CHECK (
  public.current_user_role() IN ('owner','manager','cashier')
);
-- corrections / voids handled by manager+ (ledger trigger keeps balances true)
CREATE POLICY invoices_update ON invoices FOR UPDATE USING (
  public.current_user_role() IN ('owner','manager','accountant')
) WITH CHECK (
  public.current_user_role() IN ('owner','manager','accountant')
);
-- no DELETE: void via is_void flag (append-only ledger integrity)
-- public share_token SELECT policy from v1 is preserved

-- ============ RECEIPTS (payment vouchers) ============
DROP POLICY IF EXISTS receipts_select ON receipts;
DROP POLICY IF EXISTS receipts_insert ON receipts;
DROP POLICY IF EXISTS receipts_update ON receipts;

CREATE POLICY receipts_select ON receipts FOR SELECT USING (
  auth.role() = 'authenticated'
);
CREATE POLICY receipts_insert ON receipts FOR INSERT WITH CHECK (
  public.current_user_role() IN ('owner','manager','cashier','accountant')
);
CREATE POLICY receipts_update ON receipts FOR UPDATE USING (
  public.current_user_role() IN ('owner','manager','accountant')
) WITH CHECK (
  public.current_user_role() IN ('owner','manager','accountant')
);
-- public share_token SELECT policy from v1 is preserved

-- ============ PURCHASES (supplier procurement) ============
DROP POLICY IF EXISTS purchases_select ON purchases;
DROP POLICY IF EXISTS purchases_write ON purchases;

CREATE POLICY purchases_select ON purchases FOR SELECT USING (
  public.current_user_role() IN ('owner','manager','accountant','stock_keeper','auditor')
);
CREATE POLICY purchases_write ON purchases FOR ALL USING (
  public.current_user_role() IN ('owner','manager','accountant','stock_keeper')
) WITH CHECK (
  public.current_user_role() IN ('owner','manager','accountant','stock_keeper')
);

-- ============ LEDGER ENTRIES (append-only source of truth) ============
DROP POLICY IF EXISTS ledger_select ON ledger_entries;
DROP POLICY IF EXISTS ledger_insert ON ledger_entries;

CREATE POLICY ledger_select ON ledger_entries FOR SELECT USING (
  public.current_user_role() IN ('owner','manager','accountant','auditor','cashier')
);
-- ledger rows are normally written by DB triggers; manual adjustments
-- are restricted to owner/manager/accountant
CREATE POLICY ledger_insert ON ledger_entries FOR INSERT WITH CHECK (
  public.current_user_role() IN ('owner','manager','accountant')
);
-- no UPDATE/DELETE: append-only

-- ============ CHART OF ACCOUNTS ============
DROP POLICY IF EXISTS coa_select ON chart_of_accounts;
DROP POLICY IF EXISTS coa_write ON chart_of_accounts;

CREATE POLICY coa_select ON chart_of_accounts FOR SELECT USING (
  auth.role() = 'authenticated'
);
CREATE POLICY coa_write ON chart_of_accounts FOR ALL USING (
  public.current_user_role() IN ('owner','manager','accountant')
) WITH CHECK (
  public.current_user_role() IN ('owner','manager','accountant')
);

-- ============ JOURNAL ENTRIES & LINES ============
DROP POLICY IF EXISTS journal_select ON journal_entries;
DROP POLICY IF EXISTS journal_write ON journal_entries;
DROP POLICY IF EXISTS journal_lines_select ON journal_lines;
DROP POLICY IF EXISTS journal_lines_write ON journal_lines;

CREATE POLICY journal_select ON journal_entries FOR SELECT USING (
  public.current_user_role() IN ('owner','manager','accountant','auditor')
);
CREATE POLICY journal_write ON journal_entries FOR ALL USING (
  public.current_user_role() IN ('owner','manager','accountant')
) WITH CHECK (
  public.current_user_role() IN ('owner','manager','accountant')
);
CREATE POLICY journal_lines_select ON journal_lines FOR SELECT USING (
  public.current_user_role() IN ('owner','manager','accountant','auditor')
);
CREATE POLICY journal_lines_write ON journal_lines FOR ALL USING (
  public.current_user_role() IN ('owner','manager','accountant')
) WITH CHECK (
  public.current_user_role() IN ('owner','manager','accountant')
);

-- ============ EMPLOYEES / ADVANCES / PAYROLL (HR) ============
DROP POLICY IF EXISTS employees_select ON employees;
DROP POLICY IF EXISTS employees_write_mgr ON employees;
DROP POLICY IF EXISTS employees_delete_owner ON employees;
DROP POLICY IF EXISTS advances_select ON employee_advances;
DROP POLICY IF EXISTS advances_insert ON employee_advances;
DROP POLICY IF EXISTS advances_update ON employee_advances;
DROP POLICY IF EXISTS payroll_select ON payroll;
DROP POLICY IF EXISTS payroll_write ON payroll;

CREATE POLICY employees_select ON employees FOR SELECT USING (
  public.current_user_role() IN ('owner','manager','accountant','auditor')
);
CREATE POLICY employees_write_mgr ON employees FOR INSERT WITH CHECK (
  public.current_user_role() IN ('owner','manager')
);
DROP POLICY IF EXISTS employees_update_mgr ON employees;
CREATE POLICY employees_update_mgr ON employees FOR UPDATE USING (
  public.current_user_role() IN ('owner','manager')
) WITH CHECK (
  public.current_user_role() IN ('owner','manager')
);
CREATE POLICY employees_delete_owner ON employees FOR DELETE USING (
  public.current_user_role() = 'owner'
);

CREATE POLICY advances_select ON employee_advances FOR SELECT USING (
  public.current_user_role() IN ('owner','manager','accountant','auditor')
);
-- cashiers issue advances from the galla (see app HR flow)
CREATE POLICY advances_insert ON employee_advances FOR INSERT WITH CHECK (
  public.current_user_role() IN ('owner','manager','accountant','cashier')
);
CREATE POLICY advances_update ON employee_advances FOR UPDATE USING (
  public.current_user_role() IN ('owner','manager','accountant')
) WITH CHECK (
  public.current_user_role() IN ('owner','manager','accountant')
);

CREATE POLICY payroll_select ON payroll FOR SELECT USING (
  public.current_user_role() IN ('owner','manager','accountant','auditor')
);
CREATE POLICY payroll_write ON payroll FOR ALL USING (
  public.current_user_role() IN ('owner','manager','accountant')
) WITH CHECK (
  public.current_user_role() IN ('owner','manager','accountant')
);

-- ============ DAY CLOSINGS (roznamcha) ============
DROP POLICY IF EXISTS day_closings_select ON day_closings;
DROP POLICY IF EXISTS day_closings_write ON day_closings;

CREATE POLICY day_closings_select ON day_closings FOR SELECT USING (
  public.current_user_role() IN ('owner','manager','accountant','auditor','cashier')
);
CREATE POLICY day_closings_write ON day_closings FOR ALL USING (
  public.current_user_role() IN ('owner','manager','accountant','cashier')
) WITH CHECK (
  public.current_user_role() IN ('owner','manager','accountant','cashier')
);

-- ============ EXPENSES ============
DROP POLICY IF EXISTS expenses_select ON expenses;
DROP POLICY IF EXISTS expenses_insert ON expenses;
DROP POLICY IF EXISTS expenses_modify ON expenses;

CREATE POLICY expenses_select ON expenses FOR SELECT USING (
  public.current_user_role() IN ('owner','manager','accountant','auditor','cashier')
);
CREATE POLICY expenses_insert ON expenses FOR INSERT WITH CHECK (
  public.current_user_role() IN ('owner','manager','accountant','cashier')
);
CREATE POLICY expenses_modify ON expenses FOR UPDATE USING (
  public.current_user_role() IN ('owner','manager','accountant')
) WITH CHECK (
  public.current_user_role() IN ('owner','manager','accountant')
);
DROP POLICY IF EXISTS expenses_delete ON expenses;
CREATE POLICY expenses_delete ON expenses FOR DELETE USING (
  public.current_user_role() IN ('owner','manager','accountant')
);

-- ============ WHATSAPP SHARE LOGS ============
DROP POLICY IF EXISTS wa_logs_select ON whatsapp_share_logs;
DROP POLICY IF EXISTS wa_logs_insert ON whatsapp_share_logs;

CREATE POLICY wa_logs_select ON whatsapp_share_logs FOR SELECT USING (
  public.current_user_role() IN ('owner','manager','auditor')
);
CREATE POLICY wa_logs_insert ON whatsapp_share_logs FOR INSERT WITH CHECK (
  auth.role() = 'authenticated'
);

-- ============ AUDIT LOGS ============
DROP POLICY IF EXISTS audit_select ON audit_logs;
DROP POLICY IF EXISTS audit_insert ON audit_logs;

CREATE POLICY audit_select ON audit_logs FOR SELECT USING (
  public.current_user_role() IN ('owner','manager','auditor')
);
CREATE POLICY audit_insert ON audit_logs FOR INSERT WITH CHECK (
  auth.role() = 'authenticated'
);
-- no UPDATE/DELETE: audit trail is append-only
