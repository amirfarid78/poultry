-- ============================================================================
-- NAWAZ POULTRY ERP — SUPPLIER RECEIPT LEDGER DIRECTION (W9)
-- ============================================================================
-- Problem: process_receipt_ledger() (v1 schema) posted the supplier branch
--   as debit=amount, credit=0 with ref_type 'supplier_payment'. That is
--   backwards under the app's own convention, proven by the purchase
--   trigger (20261010000002): a purchase row is debit=totalAmount,
--   credit=paid, running balance = cur + total - paid, so the supplier
--   balance = SUM(debit) - SUM(credit) and a payment that reduces the
--   payable must be a CREDIT. (The customer branch was already correct:
--   a customer payment is a credit against what they owe.)
-- Fix:
--   (a) process_receipt_ledger(): supplier branch now posts
--       credit=amount, debit=0 (customer branch unchanged).
--   (b) void_receipt() (20261014000001): its reversal mirrored the old
--       wrong original (credit for suppliers); it now posts
--       debit=amount, credit=0 for supplier_payment rows.
--   (c) Data fix: swap debit <-> credit on ALL existing ledger_entries
--       rows with ref_type='supplier_payment' (every such row currently
--       has exactly one side populated). Running-balance values were
--       computed as cur - amount on both the original and the reversal
--       paths, so they are unaffected — do NOT recompute them.
-- Self-contained: safe to re-run. Run AFTER 20261122000001.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- PART A — process_receipt_ledger(): supplier branch posts a CREDIT
--   (identical to the v1 function except the supplier INSERT's debit/credit)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.process_receipt_ledger()
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
            -- Supplier balance = SUM(debit) - SUM(credit): a payment that
            -- reduces the payable is a CREDIT (was debit=amount, credit=0).
            0,
            NEW.amount,
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

-- ---------------------------------------------------------------------------
-- PART B — void_receipt(): supplier reversal now posts a DEBIT (mirror of
--   the corrected original). Customer branch unchanged. Everything else in
--   the function is identical to 20261014000001.
-- ---------------------------------------------------------------------------

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

    -- Mirror the original row's debit/credit. The corrected original posts
    -- a supplier payment as credit=amount, so its reversal is debit=amount
    -- (was credit for suppliers, mirroring the old wrong original).
    IF v_rec.party_type::TEXT = 'customer' THEN
        v_rev_debit := COALESCE(v_rec.amount, 0); v_rev_credit := 0;
    ELSE
        v_rev_debit := COALESCE(v_rec.amount, 0); v_rev_credit := 0;
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

-- ---------------------------------------------------------------------------
-- PART C — data fix: swap debit <-> credit on every supplier_payment row.
--   Each such row has exactly one side populated, so a plain swap is exact.
--   Running balances are NOT recomputed (they were computed correctly).
-- ---------------------------------------------------------------------------

UPDATE public.ledger_entries
SET debit = credit,
    credit = debit
WHERE ref_type = 'supplier_payment';
