-- ============================================================================
-- NAWAZ POULTRY ERP — PARTY CASCADE DELETE
-- ============================================================================
-- Problem: deleting a customer/supplier with history was impossible. The
--   client refused upfront (App.tsx handleDeleteParty) because the FKs on
--   invoices / receipts / purchases / orders are NO ACTION and the RLS
--   policies forbid hard-deleting invoices and receipts ("void via is_void
--   flag", "append-only"). So a party with any document could never be
--   deleted, and its sales/data stayed forever.
-- Fix: a SECURITY DEFINER RPC that deletes the party AND every document
--   linked to it in ONE transaction, so the books can never be left
--   half-deleted:
--     * invoices (customer) + orders (customer) — invoices first, they
--       reference orders via order_id
--     * receipts (party) + purchases (supplier)
--     * ledger_entries for the party — die via the ON DELETE CASCADE FK
--       when the party row goes
--     * BR-LIVE stock: restored for the party's non-void invoices (mirror
--       of void_invoice), removed for the party's purchases (mirror of the
--       purchase save, which adds stock)
--   Owner-only: this destroys audit history — managers keep the old
--   no-documents delete. Idempotent: a second call after the party is gone
--   returns zeros instead of failing, so an outbox retry can never poison
--   the queue.
--   Day closings are snapshots and are NOT rewritten. whatsapp_share_logs /
--   audit_logs are logs (no FK) and are left alone.
-- Self-contained: safe to re-run. Run AFTER 20261023000001.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.delete_party_cascade(p_party_id UUID)
RETURNS TABLE (
  deleted_invoices INT,
  deleted_receipts INT,
  deleted_orders INT,
  deleted_purchases INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_invoices INT := 0;
  v_receipts INT := 0;
  v_orders INT := 0;
  v_purchases INT := 0;
  v_stock_kg NUMERIC(14,2) := 0;
  v_stock_birds INT := 0;
BEGIN
  SELECT role::TEXT INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role IS NULL OR v_role <> 'owner' THEN
    RAISE EXCEPTION 'delete_party_cascade: role % is not permitted to cascade-delete a party', COALESCE(v_role, 'none');
  END IF;

  -- Lock the party row; a concurrent delete of the same party serializes here.
  PERFORM 1 FROM public.parties WHERE id = p_party_id FOR UPDATE;
  IF NOT FOUND THEN
    -- Already gone (e.g. outbox retry after a first call landed): no-op.
    RETURN QUERY SELECT 0, 0, 0, 0;
    RETURN;
  END IF;

  -- Stock: + weight/birds of the party's live (non-void) sales, - weight/birds
  -- of the party's purchases. Mirrors the client's bird estimate
  -- (birdCount || round(netWeightKg / 2)) used by persistInvoiceStock and
  -- the purchase save, and the void_invoice restore.
  SELECT
    COALESCE(SUM(net_weight_kg), 0),
    COALESCE(SUM(CASE WHEN COALESCE(bird_count, 0) > 0 THEN bird_count ELSE ROUND(net_weight_kg / 2) END), 0)::INT
  INTO v_stock_kg, v_stock_birds
  FROM public.invoices
  WHERE customer_id = p_party_id AND COALESCE(is_void, false) = false;

  SELECT
    v_stock_kg - COALESCE(SUM(net_weight_kg), 0),
    v_stock_birds - COALESCE(SUM(CASE WHEN COALESCE(bird_count, 0) > 0 THEN bird_count ELSE ROUND(net_weight_kg / 2) END), 0)::INT
  INTO v_stock_kg, v_stock_birds
  FROM public.purchases
  WHERE supplier_id = p_party_id;

  UPDATE public.products
  SET current_weight_kg = GREATEST(0, COALESCE(current_weight_kg, 0) + v_stock_kg),
      current_bird_count = GREATEST(0, COALESCE(current_bird_count, 0) + v_stock_birds)
  WHERE code = 'BR-LIVE';

  -- Documents first (invoices reference orders), party last.
  DELETE FROM public.invoices WHERE customer_id = p_party_id;
  GET DIAGNOSTICS v_invoices = ROW_COUNT;

  DELETE FROM public.orders WHERE customer_id = p_party_id;
  GET DIAGNOSTICS v_orders = ROW_COUNT;

  DELETE FROM public.receipts WHERE party_id = p_party_id;
  GET DIAGNOSTICS v_receipts = ROW_COUNT;

  DELETE FROM public.purchases WHERE supplier_id = p_party_id;
  GET DIAGNOSTICS v_purchases = ROW_COUNT;

  -- Ledger rows for this party die via the ON DELETE CASCADE FK.
  DELETE FROM public.parties WHERE id = p_party_id;

  RETURN QUERY SELECT v_invoices, v_receipts, v_orders, v_purchases;
END;
$$;
