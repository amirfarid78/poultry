-- ============================================================================
-- NAWAZ POULTRY ERP — LEDGER MANDI COLUMNS + VOID (EDIT/DELETE) SUPPORT
-- ============================================================================
-- Part A: the customer/supplier ledger "Mandi Rate" column was blank for every
--   server-synced entry because ledger_entries never had mandi_rate / rate /
--   weight_kg columns and the posting triggers never populated them.
--   -> adds the columns, teaches all three posting triggers to fill them,
--      and backfills historical rows from invoices / purchases.
-- Part B: invoices / receipts could never be corrected or removed once the
--   DB triggers had posted their ledger rows. Hard-deleting would orphan
--   ledger rows and corrupt running balances, so this adds proper accounting
--   VOID functions instead:
--     * void_invoice(p_invoice_id, p_reason)  — marks the invoice void,
--       voids its ledger rows, posts reversal rows and restores the party
--       balance + broiler stock. Idempotent (no-op when already void).
--     * void_receipt(p_receipt_id, p_reason)  — same for payment vouchers.
--   Editing a sale/payment = void the old document + insert the corrected
--   one (the client does this as "void + reissue").
-- Both functions are SECURITY DEFINER with an in-function role check
-- (owner / manager / accountant only) so the client can call them via RPC
-- without ever writing ledger_entries directly.
-- Self-contained: safe to re-run. Run AFTER 20261012000002.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- PART A — mandi columns on ledger_entries
-- ---------------------------------------------------------------------------

ALTER TABLE public.ledger_entries
  ADD COLUMN IF NOT EXISTS mandi_rate NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS rate NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS weight_kg NUMERIC(10,2);

-- Invoice trigger: populate the new columns on the sale (debit) row.
CREATE OR REPLACE FUNCTION public.process_invoice_ledger()
RETURNS TRIGGER AS $$
DECLARE
    cur_bal NUMERIC(14,2);
    tot_rec NUMERIC(14,2);
    calced_new_bal NUMERIC(14,2);
BEGIN
    SELECT current_balance INTO cur_bal FROM public.parties WHERE id = NEW.customer_id FOR UPDATE;

    tot_rec := COALESCE(NEW.received_cash, 0) + COALESCE(NEW.received_ac, 0);
    calced_new_bal := cur_bal + NEW.total_amount - tot_rec;

    NEW.previous_balance := cur_bal;
    NEW.new_balance := calced_new_bal;

    INSERT INTO public.ledger_entries (
        party_id, entry_date, detail, detail_urdu, folio_no,
        debit, credit, running_balance, ref_type, ref_id,
        mandi_rate, rate, weight_kg, created_by
    ) VALUES (
        NEW.customer_id,
        NEW.invoice_date,
        CONCAT('Sale: ', NEW.net_weight_kg, ' kg @ Rs ', NEW.sale_rate_per_40kg, '/40kg'),
        CONCAT('مرغ فروخت: ', NEW.net_weight_kg, ' کلو، ریٹ ', NEW.sale_rate_per_40kg),
        NEW.invoice_number,
        NEW.total_amount, 0,
        cur_bal + NEW.total_amount,
        'invoice', NEW.id,
        NEW.mandi_rate_per_40kg, NEW.sale_rate_per_40kg, NEW.net_weight_kg,
        NEW.created_by
    );

    IF tot_rec > 0 THEN
        INSERT INTO public.ledger_entries (
            party_id, entry_date, detail, detail_urdu, folio_no,
            debit, credit, running_balance, ref_type, ref_id, created_by
        ) VALUES (
            NEW.customer_id,
            NEW.invoice_date,
            CONCAT('Payment Recd (Cash: ', NEW.received_cash, ', AC: ', NEW.received_ac, ')'),
            CONCAT('وصولی نقد: ', NEW.received_cash, '، اکاؤنٹ: ', NEW.received_ac),
            NEW.invoice_number,
            0, tot_rec,
            calced_new_bal,
            'invoice_payment', NEW.id,
            NEW.created_by
        );
    END IF;

    UPDATE public.parties SET current_balance = calced_new_bal WHERE id = NEW.customer_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Purchase trigger: same treatment for the supplier purchase row.
CREATE OR REPLACE FUNCTION public.process_purchase_ledger()
RETURNS TRIGGER AS $$
DECLARE
    cur_bal NUMERIC(14,2);
    paid NUMERIC(14,2);
    calced_new_bal NUMERIC(14,2);
BEGIN
    SELECT current_balance INTO cur_bal FROM public.parties WHERE id = NEW.supplier_id FOR UPDATE;

    paid := COALESCE(NEW.paid_cash, 0) + COALESCE(NEW.paid_bank, 0);
    calced_new_bal := cur_bal + NEW.total_amount - paid;

    NEW.previous_balance := cur_bal;
    NEW.new_balance := calced_new_bal;

    INSERT INTO public.ledger_entries (
        party_id, entry_date, detail, detail_urdu, folio_no,
        debit, credit, running_balance, ref_type, ref_id,
        mandi_rate, rate, weight_kg, created_by
    ) VALUES (
        NEW.supplier_id,
        NEW.purchase_date,
        CONCAT('Purchase: ', NEW.net_weight_kg, ' kg @ Rs ', NEW.rate_per_40kg, '/40kg'),
        CONCAT('مال خریداری: ', NEW.net_weight_kg, ' کلو، ریٹ ', NEW.rate_per_40kg),
        NEW.purchase_number,
        NEW.total_amount, paid,
        calced_new_bal,
        'purchase', NEW.id,
        NEW.rate_per_40kg, NEW.rate_per_40kg, NEW.net_weight_kg,
        NEW.created_by
    );

    UPDATE public.parties SET current_balance = calced_new_bal WHERE id = NEW.supplier_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Backfill rows posted before the columns existed.
UPDATE public.ledger_entries le
SET mandi_rate = i.mandi_rate_per_40kg,
    rate       = i.sale_rate_per_40kg,
    weight_kg  = i.net_weight_kg
FROM public.invoices i
WHERE le.ref_id = i.id
  AND le.ref_type = 'invoice'
  AND le.mandi_rate IS NULL;

UPDATE public.ledger_entries le
SET mandi_rate = p.rate_per_40kg,
    rate       = p.rate_per_40kg,
    weight_kg  = p.net_weight_kg
FROM public.purchases p
WHERE le.ref_id = p.id
  AND le.ref_type = 'purchase'
  AND le.mandi_rate IS NULL;

-- ---------------------------------------------------------------------------
-- PART B — void support
-- ---------------------------------------------------------------------------

ALTER TABLE public.receipts
  ADD COLUMN IF NOT EXISTS is_void BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS void_reason TEXT;

-- Void a sale invoice: mark void, void its ledger rows, post reversal rows,
-- restore the party balance and the broiler stock consumed by the sale.
-- Idempotent: calling it twice is a no-op.
CREATE OR REPLACE FUNCTION public.void_invoice(p_invoice_id UUID, p_reason TEXT DEFAULT 'Voided by user')
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role TEXT;
    v_inv RECORD;
    v_tot_rec NUMERIC(14,2);
    v_bal NUMERIC(14,2);
    v_led RECORD;
BEGIN
    SELECT role::TEXT INTO v_role FROM public.profiles WHERE id = auth.uid();
    IF v_role IS NULL OR v_role NOT IN ('owner', 'manager', 'accountant') THEN
        RAISE EXCEPTION 'void_invoice: role % is not permitted to void invoices', COALESCE(v_role, 'none');
    END IF;

    SELECT * INTO v_inv FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'void_invoice: invoice % not found', p_invoice_id;
    END IF;
    IF COALESCE(v_inv.is_void, false) THEN
        RETURN; -- already void: idempotent no-op
    END IF;

    UPDATE public.invoices
    SET is_void = true, void_reason = p_reason
    WHERE id = p_invoice_id;

    -- Void the trigger-posted rows (kept for audit).
    UPDATE public.ledger_entries
    SET is_void = true
    WHERE ref_id = p_invoice_id
      AND ref_type IN ('invoice', 'invoice_payment')
      AND COALESCE(is_void, false) = false;

    -- Post reversal rows, newest first, so running balances stay truthful.
    SELECT current_balance INTO v_bal FROM public.parties WHERE id = v_inv.customer_id FOR UPDATE;
    v_tot_rec := COALESCE(v_inv.received_cash, 0) + COALESCE(v_inv.received_ac, 0);

    FOR v_led IN
        SELECT * FROM public.ledger_entries
        WHERE ref_id = p_invoice_id AND ref_type IN ('invoice', 'invoice_payment')
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
            v_led.ref_type, p_invoice_id,
            auth.uid()
        );
    END LOOP;

    UPDATE public.parties SET current_balance = v_bal WHERE id = v_inv.customer_id;

    -- Restore the broiler stock this sale consumed (app convention: BR-LIVE).
    UPDATE public.products
    SET current_weight_kg = COALESCE(current_weight_kg, 0) + COALESCE(v_inv.net_weight_kg, 0),
        current_bird_count = COALESCE(current_bird_count, 0) + COALESCE(v_inv.bird_count, 0)
    WHERE code = 'BR-LIVE';
END;
$$;

-- Void a payment voucher. Mirrors the receipt trigger's balance math:
-- both customer receipts and supplier payments subtracted `amount` from the
-- party balance, so the reversal adds it back. Idempotent.
CREATE OR REPLACE FUNCTION public.void_receipt(p_receipt_id UUID, p_reason TEXT DEFAULT 'Voided by user')
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role TEXT;
    v_rec RECORD;
    v_bal NUMERIC(14,2);
    v_rev_debit NUMERIC(14,2);
    v_rev_credit NUMERIC(14,2);
BEGIN
    SELECT role::TEXT INTO v_role FROM public.profiles WHERE id = auth.uid();
    IF v_role IS NULL OR v_role NOT IN ('owner', 'manager', 'accountant') THEN
        RAISE EXCEPTION 'void_receipt: role % is not permitted to void receipts', COALESCE(v_role, 'none');
    END IF;

    SELECT * INTO v_rec FROM public.receipts WHERE id = p_receipt_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'void_receipt: receipt % not found', p_receipt_id;
    END IF;
    IF COALESCE(v_rec.is_void, false) THEN
        RETURN; -- already void: idempotent no-op
    END IF;

    UPDATE public.receipts
    SET is_void = true, void_reason = p_reason
    WHERE id = p_receipt_id;

    UPDATE public.ledger_entries
    SET is_void = true
    WHERE ref_id = p_receipt_id
      AND ref_type IN ('receipt', 'supplier_payment')
      AND COALESCE(is_void, false) = false;

    SELECT current_balance INTO v_bal FROM public.parties WHERE id = v_rec.party_id FOR UPDATE;
    v_bal := v_bal + COALESCE(v_rec.amount, 0);

    -- Mirror the original row's debit/credit.
    IF v_rec.party_type::TEXT = 'customer' THEN
        v_rev_debit := COALESCE(v_rec.amount, 0); v_rev_credit := 0;
    ELSE
        v_rev_debit := 0; v_rev_credit := COALESCE(v_rec.amount, 0);
    END IF;

    INSERT INTO public.ledger_entries (
        party_id, entry_date, detail, detail_urdu, folio_no,
        debit, credit, running_balance, ref_type, ref_id, created_by
    ) VALUES (
        v_rec.party_id,
        CURRENT_DATE,
        'VOID reversal: payment ' || v_rec.receipt_number || ' (' || COALESCE(v_rec.amount, 0) || ')',
        'وائڈ واپسی: ادائیگی ' || v_rec.receipt_number,
        v_rec.receipt_number,
        v_rev_debit, v_rev_credit,
        v_bal,
        CASE WHEN v_rec.party_type::TEXT = 'customer' THEN 'receipt' ELSE 'supplier_payment' END,
        p_receipt_id,
        auth.uid()
    );

    UPDATE public.parties SET current_balance = v_bal WHERE id = v_rec.party_id;
END;
$$;
