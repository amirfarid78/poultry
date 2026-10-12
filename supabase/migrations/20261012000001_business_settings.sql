-- ============================================================================
-- NAWAZ POULTRY ERP: BUSINESS SETTINGS (single-row branding/profile table)
-- ============================================================================
-- One row (id = 1) holding the business profile shown across the app:
-- navbar, login screen, invoices, receipts, WhatsApp share texts.
-- Authenticated users can read; only owners can update.
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

CREATE TABLE IF NOT EXISTS public.business_settings (
  id            INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  name_en       TEXT NOT NULL DEFAULT 'Nawaz Poultry',
  name_ur       TEXT NOT NULL DEFAULT 'نواز پولٹری',
  tagline       TEXT NOT NULL DEFAULT 'Since 1995',
  phone         TEXT NOT NULL DEFAULT '',
  address       TEXT NOT NULL DEFAULT '',
  city          TEXT NOT NULL DEFAULT 'Lahore',
  logo_url      TEXT NOT NULL DEFAULT '/logo.png',
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by    UUID REFERENCES public.profiles(id)
);

ALTER TABLE public.business_settings ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read the business profile.
DROP POLICY IF EXISTS "business_settings_read" ON public.business_settings;
CREATE POLICY "business_settings_read"
  ON public.business_settings FOR SELECT
  TO authenticated
  USING (true);

-- Only owners can update it.
DROP POLICY IF EXISTS "business_settings_owner_update" ON public.business_settings;
CREATE POLICY "business_settings_owner_update"
  ON public.business_settings FOR UPDATE
  TO authenticated
  USING (public.current_user_role() = 'owner')
  WITH CHECK (public.current_user_role() = 'owner');

-- Only owners can insert the seed row (normally inserted once below).
DROP POLICY IF EXISTS "business_settings_owner_insert" ON public.business_settings;
CREATE POLICY "business_settings_owner_insert"
  ON public.business_settings FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_role() = 'owner');

-- Seed the single row with Nawaz Poultry branding.
INSERT INTO public.business_settings (id, name_en, name_ur, tagline, phone, address, city, logo_url)
VALUES (1, 'Nawaz Poultry', 'نواز پولٹری', 'Since 1995', '', '', 'Lahore', '/logo.png')
ON CONFLICT (id) DO NOTHING;

-- Keep updated_at fresh.
CREATE OR REPLACE FUNCTION public.touch_business_settings_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_business_settings_updated_at ON public.business_settings;
CREATE TRIGGER trg_business_settings_updated_at
  BEFORE UPDATE ON public.business_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_business_settings_updated_at();
