-- ============================================================================
-- NAWAZ POULTRY ERP — PUBLIC SHARE LINKS VIA TOKEN-BOUND RPC (P0-1)
-- ============================================================================
-- Problem: the v1 schema granted anon a blanket SELECT on invoices/receipts
--   whenever share_token IS NOT NULL ("Public invoice view via share token"
--   / "Public receipt view via share token"), and the v2 role-RLS migration
--   kept those policies and GRANTed SELECT ON invoices/receipts TO anon.
--   Anyone with only the publishable key could list the whole sales history
--   (`.select('*')` with no token filter) — the share token was never
--   actually checked. A parent-agent live anon probe confirmed invoices +
--   receipts return rows to anonymous callers.
-- Fix: replace the permissive policies with token-bound SECURITY DEFINER
--   RPCs. Each function returns at most ONE row, only when the caller's
--   token matches that row's share_token exactly and the row is not void.
--   The party/customer name is joined in server-side, so the anon client
--   no longer needs (and no longer gets) any access to parties.
--   * get_public_invoice(p_token)  -> one invoices row + customer_name /
--     customer_urdu_name, or an empty set.
--   * get_public_receipt(p_token)  -> one receipts row + party_name /
--     party_urdu_name, or an empty set.
--   The app (src/lib/publicInvoice.ts) calls these RPCs and falls back to
--   the direct `.from('invoices').select('*').eq('share_token', ...)` query
--   only until this migration runs; once it runs, the direct query is
--   denied (SELECT revoked from anon below) and only the RPC path works.
-- Self-contained: safe to re-run. Run AFTER 20261116000001.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- PART A — token-bound read RPCs (read-only: STABLE, no writes)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_public_invoice(p_token TEXT)
RETURNS TABLE (
  id UUID,
  invoice_number TEXT,
  fiscal_year TEXT,
  invoice_date DATE,
  customer_id UUID,
  order_id UUID,
  product_id UUID,
  vehicle_id UUID,
  driver_id UUID,
  mandi_rate_per_40kg NUMERIC,
  sale_rate_per_40kg NUMERIC,
  margin_per_40kg NUMERIC,
  gross_weight_kg NUMERIC,
  shrinkage_kg NUMERIC,
  net_weight_kg NUMERIC,
  bird_count INT,
  mann_divisor NUMERIC,
  total_amount NUMERIC,
  charges JSONB,
  received_cash NUMERIC,
  received_ac NUMERIC,
  ac_payment_mode TEXT,
  ac_ref_no TEXT,
  discount_amount NUMERIC,
  previous_balance NUMERIC,
  new_balance NUMERIC,
  share_token TEXT,
  is_void BOOLEAN,
  void_reason TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ,
  customer_name TEXT,
  customer_urdu_name TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    i.id, i.invoice_number, i.fiscal_year, i.invoice_date, i.customer_id,
    i.order_id, i.product_id, i.vehicle_id, i.driver_id,
    i.mandi_rate_per_40kg, i.sale_rate_per_40kg, i.margin_per_40kg,
    i.gross_weight_kg, i.shrinkage_kg, i.net_weight_kg, i.bird_count,
    i.mann_divisor, i.total_amount, i.charges, i.received_cash, i.received_ac,
    i.ac_payment_mode::TEXT, i.ac_ref_no, i.discount_amount,
    i.previous_balance, i.new_balance, i.share_token, i.is_void,
    i.void_reason, i.created_by, i.created_at,
    p.name, p.urdu_name
  FROM public.invoices i
  LEFT JOIN public.parties p ON p.id = i.customer_id
  WHERE p_token IS NOT NULL
    AND p_token <> ''
    AND i.share_token = p_token
    AND COALESCE(i.is_void, false) = false
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_public_receipt(p_token TEXT)
RETURNS TABLE (
  id UUID,
  receipt_number TEXT,
  receipt_date DATE,
  party_id UUID,
  party_type TEXT,
  amount NUMERIC,
  payment_mode TEXT,
  bank_name TEXT,
  ref_no TEXT,
  notes TEXT,
  previous_balance NUMERIC,
  new_balance NUMERIC,
  share_token TEXT,
  is_void BOOLEAN,
  void_reason TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ,
  party_name TEXT,
  party_urdu_name TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    r.id, r.receipt_number, r.receipt_date, r.party_id,
    r.party_type::TEXT, r.amount, r.payment_mode::TEXT, r.bank_name,
    r.ref_no, r.notes, r.previous_balance, r.new_balance, r.share_token,
    r.is_void, r.void_reason, r.created_by, r.created_at,
    p.name, p.urdu_name
  FROM public.receipts r
  LEFT JOIN public.parties p ON p.id = r.party_id
  WHERE p_token IS NOT NULL
    AND p_token <> ''
    AND r.share_token = p_token
    AND COALESCE(r.is_void, false) = false
  LIMIT 1;
$$;

-- Anon must be able to execute the RPCs (that is the point of the fix);
-- the functions themselves enforce the token check and are read-only.
GRANT EXECUTE ON FUNCTION public.get_public_invoice(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_receipt(TEXT) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- PART B — drop the permissive anon share policies (verified names from the
--   v1 schema migration 20240101000000: "Public invoice view via share
--   token" / "Public receipt view via share token")
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Public invoice view via share token" ON public.invoices;
DROP POLICY IF EXISTS "Public receipt view via share token" ON public.receipts;

-- ---------------------------------------------------------------------------
-- PART C — anon loses direct SELECT on both tables entirely. Staff reads
--   continue through their own role-based RLS policies (authenticated).
-- ---------------------------------------------------------------------------

REVOKE SELECT ON public.invoices FROM anon;
REVOKE SELECT ON public.receipts FROM anon;
