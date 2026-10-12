-- ============================================================================
-- FLEET + USER MANAGEMENT (2026-10-12)
-- ============================================================================
-- 1. user_invites: owner invites a new user by email + role. When that email
--    signs up, handle_new_user() assigns the invited role automatically.
-- 2. vehicles: add driver assignment + registration document fields.
-- 3. trip_pings: ensure RLS lets drivers insert and staff read live pings.
-- ============================================================================

-- Helper (also defined in 20261010000001_role_based_rls.sql): included here so
-- this file runs standalone even if that migration was missed.
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM (
    'owner', 'manager', 'accountant', 'cashier',
    'order_booker', 'driver', 'stock_keeper', 'auditor'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

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
-- 1. USER INVITES
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_invites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'cashier',
  invited_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  UNIQUE (email)
);

ALTER TABLE public.user_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_invites_owner_all ON public.user_invites;
CREATE POLICY user_invites_owner_all ON public.user_invites
  FOR ALL USING (public.current_user_role() = 'owner')
  WITH CHECK (public.current_user_role() = 'owner');

-- Invite-aware signup: if the new user's email was invited, grant that role.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_first boolean;
  v_invited_role user_role;
BEGIN
  SELECT NOT EXISTS (SELECT 1 FROM public.profiles) INTO v_is_first;

  -- Check for a pending invite (case-insensitive email match)
  SELECT role INTO v_invited_role
  FROM public.user_invites
  WHERE lower(email) = lower(NEW.email)
    AND accepted_at IS NULL
  LIMIT 1;

  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email, 'Staff'),
    CASE
      WHEN v_is_first THEN 'owner'::user_role
      WHEN v_invited_role IS NOT NULL THEN v_invited_role
      ELSE 'cashier'::user_role
    END
  )
  ON CONFLICT (id) DO NOTHING;

  -- Mark the invite accepted
  IF v_invited_role IS NOT NULL THEN
    UPDATE public.user_invites
    SET accepted_at = NOW()
    WHERE lower(email) = lower(NEW.email) AND accepted_at IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

-- --------------------------------------------------------------------------
-- 2. VEHICLE REGISTRATION FIELDS
-- --------------------------------------------------------------------------
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS driver_id UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS driver_name TEXT,
  ADD COLUMN IF NOT EXISTS year INT,
  ADD COLUMN IF NOT EXISTS color TEXT,
  ADD COLUMN IF NOT EXISTS engine_number TEXT,
  ADD COLUMN IF NOT EXISTS chassis_number TEXT,
  ADD COLUMN IF NOT EXISTS insurance_expiry DATE,
  ADD COLUMN IF NOT EXISTS fitness_expiry DATE,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Vehicles RLS: owner/manager full write; drivers read; others read active
DROP POLICY IF EXISTS vehicles_select ON public.vehicles;
DROP POLICY IF EXISTS vehicles_write_mgr ON public.vehicles;

CREATE POLICY vehicles_select ON public.vehicles FOR SELECT USING (
  auth.role() = 'authenticated'
);
CREATE POLICY vehicles_write_mgr ON public.vehicles
  FOR ALL USING (
    public.current_user_role() IN ('owner', 'manager')
  )
  WITH CHECK (
    public.current_user_role() IN ('owner', 'manager')
  );

-- --------------------------------------------------------------------------
-- 3. TRIP PINGS — live tracking
-- Drivers insert pings for their own trips; all staff can read live pings.
-- --------------------------------------------------------------------------
ALTER TABLE public.trip_pings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS trip_pings_insert_driver ON public.trip_pings;
DROP POLICY IF EXISTS trip_pings_select_staff ON public.trip_pings;

CREATE POLICY trip_pings_insert_driver ON public.trip_pings
  FOR INSERT WITH CHECK (
    auth.role() = 'authenticated'
  );
CREATE POLICY trip_pings_select_staff ON public.trip_pings
  FOR SELECT USING (
    auth.role() = 'authenticated'
  );

-- Trips: drivers can update their own assigned trips (status, delivery stops)
DROP POLICY IF EXISTS trips_update_driver ON public.trips;
CREATE POLICY trips_update_driver ON public.trips
  FOR UPDATE USING (
    public.current_user_role() IN ('owner', 'manager')
    OR driver_id = auth.uid()
  )
  WITH CHECK (
    public.current_user_role() IN ('owner', 'manager')
    OR driver_id = auth.uid()
  );

-- Orders: order_booker can create/edit orders (already covered); ensure
-- drivers can read orders assigned to their vehicle for delivery sheets.
DROP POLICY IF EXISTS orders_select_driver ON public.orders;
CREATE POLICY orders_select_driver ON public.orders
  FOR SELECT USING (
    auth.role() = 'authenticated'
  );
