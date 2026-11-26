-- MURGH MANDI ERP: VOID A SUPPLIER PURCHASE
-- Mirrors void_invoice() / void_receipt() (20261014000001): the client never
-- writes ledger_entries directly — the SECURITY DEFINER RPC owns the void.
-- A purchase entry had NO delete path at all (no handler, no RPC, no button),
-- so a wrong purchase could only be removed by deleting the whole supplier
-- account. void_purchase() marks the purchase void, voids its trigger-posted
-- ledger row, posts a reversal row, restores the supplier balance and takes
-- the stock back out of BR-LIVE. Idempotent: calling it twice is a no-op.
-- Roles mirror void_invoice(): owner / manager / accountant.

ALTER TABLE public.purchases
  ADD COLUMN IF NOT EXISTS is_void BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS void_reason TEXT;

CREATE OR REPLACE FUNCTION public.void_purchase(p_purchase_id UUID, p_reason TEXT DEFAULT 'Voided by user')
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role TEXT;
    v_pur RECORD;
    v_bal NUMERIC(14,2);
    v_led RECORD;
BEGIN
    SELECT role::TEXT INTO v_role FROM public.profiles WHERE id = auth.uid();
    IF v_role IS NULL OR v_role NOT IN ('owner', 'manager', 'accountant') THEN
        RAISE EXCEPTION 'void_purchase: role % is not permitted to void purchases', COALESCE(v_role, 'none');
    END IF;

    SELECT * INTO v_pur FROM public.purchases WHERE id = p_purchase_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'void_purchase: purchase % not found', p_purchase_id;
    END IF;
    IF COALESCE(v_pur.is_void, false) THEN
        RETURN; -- already void: idempotent no-op
    END IF;

    UPDATE public.purchases
    SET is_void = true, void_reason = p_reason
    WHERE id = p_purchase_id;

    -- Void the trigger-posted row (kept for audit).
    UPDATE public.ledger_entries
    SET is_void = true
    WHERE ref_id = p_purchase_id
      AND ref_type = 'purchase'
      AND COALESCE(is_void, false) = false;

    -- Post reversal rows, newest first, so running balances stay truthful.
    SELECT current_balance INTO v_bal FROM public.parties WHERE id = v_pur.supplier_id FOR UPDATE;

    FOR v_led IN
        SELECT * FROM public.ledger_entries
        WHERE ref_id = p_purchase_id AND ref_type = 'purchase'
        ORDER BY created_at DESC
    LOOP
        v_bal := v_bal - COALESCE(v_led.debit, 0) + COALESCE(v_led.credit, 0);
        INSERT INTO public.ledger_entries (
            party_id, entry_date, detail, detail_urdu, folio_no,
            debit, credit, running_balance, ref_type, ref_id, created_by
        ) VALUES (
            v_led.party_id,
            CURRENT_DATE,
            'VOID reversal: ' || v_led.detail,
            'وائڈ واپسی: ' || v_led.detail_urdu,
            v_led.folio_no,
            COALESCE(v_led.credit, 0), COALESCE(v_led.debit, 0),
            v_bal,
            'purchase', p_purchase_id,
            auth.uid()
        );
    END LOOP;

    UPDATE public.parties SET current_balance = v_bal WHERE id = v_pur.supplier_id;

    -- Take the stock this purchase added back out (app convention: BR-LIVE).
    UPDATE public.products
    SET current_weight_kg = GREATEST(0, COALESCE(current_weight_kg, 0) - COALESCE(v_pur.net_weight_kg, 0)),
        current_bird_count = GREATEST(0, COALESCE(current_bird_count, 0) - COALESCE(v_pur.bird_count, 0))
    WHERE code = 'BR-LIVE';
END;
$$;
