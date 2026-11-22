-- ============================================================================
-- SCRATCH TEST — delete_party_cascade (supabase/migrations/20261116000001)
-- ============================================================================
-- Run ONLY against a scratch PostgreSQL server, never the live project:
--   cd ~/workspace/poultry
--   psql -v ON_ERROR_STOP=1 -d postgres -f supabase/tests/party_cascade_delete.sql
-- It drops/creates a database named cascade_test, stubs auth.uid() (the
-- Supabase auth schema does not exist in vanilla Postgres), builds a
-- minimal schema with the same FKs the function relies on, seeds test data,
-- runs the real migration file, and asserts the result. Any failed assertion
-- raises and aborts the run (ON_ERROR_STOP=1).
-- ============================================================================

DROP DATABASE IF EXISTS cascade_test;
CREATE DATABASE cascade_test;
\c cascade_test

-- Stub Supabase auth: uid() reads a session setting so the role check can be
-- exercised as owner and as manager.
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('app.test_uid', true), ''),
    '00000000-0000-4000-8000-000000000001')::uuid
$$;

-- Minimal schema: same FK directions as the real migrations (NO ACTION
-- everywhere except ledger_entries.party_id, which is ON DELETE CASCADE).
CREATE TABLE public.profiles (id uuid PRIMARY KEY, role text NOT NULL);
CREATE TABLE public.parties (id uuid PRIMARY KEY);
CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE,
  current_weight_kg numeric(14,2) DEFAULT 0,
  current_bird_count int DEFAULT 0
);
CREATE TABLE public.orders (
  id uuid PRIMARY KEY,
  customer_id uuid REFERENCES public.parties(id) NOT NULL
);
CREATE TABLE public.invoices (
  id uuid PRIMARY KEY,
  customer_id uuid REFERENCES public.parties(id) NOT NULL,
  order_id uuid REFERENCES public.orders(id),
  is_void boolean DEFAULT false,
  net_weight_kg numeric(10,2) NOT NULL,
  bird_count int DEFAULT 0
);
CREATE TABLE public.receipts (
  id uuid PRIMARY KEY,
  party_id uuid REFERENCES public.parties(id) NOT NULL
);
CREATE TABLE public.purchases (
  id uuid PRIMARY KEY,
  supplier_id uuid REFERENCES public.parties(id) NOT NULL,
  net_weight_kg numeric(10,2) NOT NULL,
  bird_count int DEFAULT 0
);
CREATE TABLE public.ledger_entries (
  id uuid PRIMARY KEY,
  party_id uuid REFERENCES public.parties(id) ON DELETE CASCADE NOT NULL
);

-- Seed: owner + manager profiles, BR-LIVE stock 1000kg / 500 birds.
INSERT INTO public.profiles VALUES
  ('00000000-0000-4000-8000-000000000001', 'owner'),
  ('00000000-0000-4000-8000-000000000002', 'manager');
INSERT INTO public.products (code, current_weight_kg, current_bird_count)
  VALUES ('BR-LIVE', 1000, 500);

-- Customer P (to be cascade-deleted) and customer Q (must survive untouched).
INSERT INTO public.parties VALUES
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222');
-- P: 1 order, 2 live invoices (100kg/50 birds; 80kg/0 birds -> est 40),
-- 1 void invoice (50kg/25 birds, must NOT restore stock), 2 receipts,
-- 1 purchase (200kg/100 birds, must REMOVE stock), 3 ledger rows.
INSERT INTO public.orders VALUES
  ('66666666-6666-4666-8666-666666666666', '11111111-1111-4111-8111-111111111111');
INSERT INTO public.invoices VALUES
  ('44444444-4444-4444-8444-444444444444', '11111111-1111-4111-8111-111111111111', '66666666-6666-4666-8666-666666666666', false, 100, 50),
  ('44444444-4444-4444-8444-444444444445', '11111111-1111-4111-8111-111111111111', NULL, false, 80, 0),
  ('44444444-4444-4444-8444-444444444446', '11111111-1111-4111-8111-111111111111', NULL, true, 50, 25);
INSERT INTO public.receipts VALUES
  ('55555555-5555-4555-8555-555555555555', '11111111-1111-4111-8111-111111111111'),
  ('55555555-5555-4555-8555-555555555556', '11111111-1111-4111-8111-111111111111');
INSERT INTO public.purchases VALUES
  ('77777777-7777-4777-8777-777777777777', '11111111-1111-4111-8111-111111111111', 200, 100);
INSERT INTO public.ledger_entries VALUES
  ('99999999-9999-4999-8999-999999999999', '11111111-1111-4111-8111-111111111111'),
  ('99999999-9999-4999-8999-999999999998', '11111111-1111-4111-8111-111111111111'),
  ('99999999-9999-4999-8999-999999999997', '11111111-1111-4111-8111-111111111111');
-- Q: 1 live invoice, 1 receipt, 1 ledger row — all must survive.
INSERT INTO public.invoices VALUES
  ('44444444-4444-4444-8444-444444444447', '22222222-2222-4222-8222-222222222222', NULL, false, 10, 5);
INSERT INTO public.receipts VALUES
  ('55555555-5555-4555-8555-555555555557', '22222222-2222-4222-8222-222222222222');
INSERT INTO public.ledger_entries VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222');

-- The real migration under test.
\i supabase/migrations/20261116000001_party_cascade_delete.sql

-- 1. Role check: a manager must be refused.
DO $$
BEGIN
  PERFORM set_config('app.test_uid', '00000000-0000-4000-8000-000000000002', false);
  PERFORM * FROM public.delete_party_cascade('22222222-2222-4222-8222-222222222222'::uuid);
  RAISE EXCEPTION 'manager call should have been refused';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE '%not permitted%' THEN RAISE; END IF;
  RAISE NOTICE 'PASS role check: manager blocked (%)', SQLERRM;
END $$;
SELECT set_config('app.test_uid', '', false);

-- 2. Cascade customer P as owner; assert the returned counts.
DO $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM public.delete_party_cascade('11111111-1111-4111-8111-111111111111'::uuid);
  IF r.deleted_invoices <> 3 THEN RAISE EXCEPTION 'invoices % expected 3', r.deleted_invoices; END IF;
  IF r.deleted_receipts <> 2 THEN RAISE EXCEPTION 'receipts % expected 2', r.deleted_receipts; END IF;
  IF r.deleted_orders <> 1 THEN RAISE EXCEPTION 'orders % expected 1', r.deleted_orders; END IF;
  IF r.deleted_purchases <> 1 THEN RAISE EXCEPTION 'purchases % expected 1', r.deleted_purchases; END IF;
  RAISE NOTICE 'PASS counts: invoices=3 receipts=2 orders=1 purchases=1';
END $$;

-- 3. P and all its rows are gone; Q is untouched.
DO $$
DECLARE
  n_party int; n_inv int; n_rec int; n_ord int; n_pur int; n_led int;
  q_inv int; q_rec int; q_led int; stock_kg numeric; stock_birds int;
BEGIN
  SELECT count(*) INTO n_party FROM public.parties WHERE id = '11111111-1111-4111-8111-111111111111';
  SELECT count(*) INTO n_inv FROM public.invoices WHERE customer_id = '11111111-1111-4111-8111-111111111111';
  SELECT count(*) INTO n_rec FROM public.receipts WHERE party_id = '11111111-1111-4111-8111-111111111111';
  SELECT count(*) INTO n_ord FROM public.orders WHERE customer_id = '11111111-1111-4111-8111-111111111111';
  SELECT count(*) INTO n_pur FROM public.purchases WHERE supplier_id = '11111111-1111-4111-8111-111111111111';
  SELECT count(*) INTO n_led FROM public.ledger_entries WHERE party_id = '11111111-1111-4111-8111-111111111111';
  IF n_party + n_inv + n_rec + n_ord + n_pur + n_led <> 0 THEN
    RAISE EXCEPTION 'P rows remain: party=% inv=% rec=% ord=% pur=% led=%', n_party, n_inv, n_rec, n_ord, n_pur, n_led;
  END IF;
  SELECT count(*) INTO q_inv FROM public.invoices WHERE customer_id = '22222222-2222-4222-8222-222222222222';
  SELECT count(*) INTO q_rec FROM public.receipts WHERE party_id = '22222222-2222-4222-8222-222222222222';
  SELECT count(*) INTO q_led FROM public.ledger_entries WHERE party_id = '22222222-2222-4222-8222-222222222222';
  IF q_inv <> 1 OR q_rec <> 1 OR q_led <> 1 THEN
    RAISE EXCEPTION 'Q damaged: inv=% rec=% led=%', q_inv, q_rec, q_led;
  END IF;
  -- Stock: 1000 + (100+80 live sales) - 200 purchase = 980kg;
  -- 500 + (50 + est 40) - 100 = 490 birds. Void invoice (50kg/25) excluded.
  SELECT current_weight_kg, current_bird_count INTO stock_kg, stock_birds
    FROM public.products WHERE code = 'BR-LIVE';
  IF stock_kg <> 980 THEN RAISE EXCEPTION 'stock kg % expected 980', stock_kg; END IF;
  IF stock_birds <> 490 THEN RAISE EXCEPTION 'stock birds % expected 490', stock_birds; END IF;
  RAISE NOTICE 'PASS P fully deleted, Q intact, stock 980kg / 490 birds';
END $$;

-- 4. Idempotency: a second call on the gone party returns zeros, no error.
DO $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM public.delete_party_cascade('11111111-1111-4111-8111-111111111111'::uuid);
  IF r.deleted_invoices <> 0 OR r.deleted_receipts <> 0 OR r.deleted_orders <> 0 OR r.deleted_purchases <> 0 THEN
    RAISE EXCEPTION 'second call not zero: %/%/%/%', r.deleted_invoices, r.deleted_receipts, r.deleted_orders, r.deleted_purchases;
  END IF;
  RAISE NOTICE 'PASS idempotent second call returns zeros';
END $$;

SELECT 'ALL CASCADE TESTS PASSED' AS result;
