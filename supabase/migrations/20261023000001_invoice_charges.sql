-- ============================================================================
-- NAWAZ POULTRY ERP — INVOICE EXTRA CHARGES + LEDGER ENTRY EDITING
-- ============================================================================
-- Part A: invoice-level extra charges (labour, loading, transport, or any
--   manually named charge) recorded as structured JSONB on the invoice row:
--     * invoices.charges JSONB — [{name, amount}, ...]
--   The invoice ledger trigger now posts one debit row per charge
--   (ref_type = 'invoice_charge') between the sale row and the payment row,
--   so charges are first-class ledger entries with running balances.
--   void_invoice() is taught to reverse 'invoice_charge' rows too.
--
-- Part B: edit_ledger_entry() RPC — lets owner/manager/accountant correct a
--   ledger row end-to-end:
--     * date / narration editable on every non-void row
--     * amount editable ONLY on manually maintained rows
--       ('adjustment', 'opening', 'journal'); document-posted rows
--       (invoice / payment / purchase / receipt / charge) keep their amounts
--       because the source document owns them (edit/void the document).
--   After any edit the party's running balances are recomputed in
--   chronological order (voided rows excluded — their reversals carry the
--   correction), and parties.current_balance (+ opening_balance for opening
--   rows) is refreshed. Idempotent per call; role-checked like void_*.
--
-- Self-contained: safe to re-run. Run AFTER 20261014000001.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- PART A — charges column on invoices
-- ---------------------------------------------------------------------------

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS charges JSONB NOT NULL DEFAULT '[]'::jsonb;

-- ---------------------------------------------------------------------------
-- PART A2 — charges-aware invoice ledger trigger (replaces 20261014000001)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.process_invoice_ledger()
RETURNS TRIGGER AS $$
DECLARE
    cur_bal NUMERIC(14,2);
    tot_rec NUMERIC(14,2);
    charges_total NUMERIC(14,2) := 0;
    bird_total NUMERIC(14,2);
    run_bal NUMERIC(14,2);
    calced_new_bal NUMERIC(14,2);
    charge JSONB;
    charge_name TEXT;
    charge_amt NUMERIC(14,2);
BEGIN
    SELECT current_balance INTO cur_bal FROM public.parties WHERE id = NEW.customer_id FOR UPDATE;

    -- Sum the invoice-level extra charges (labour, loading, custom names).
    IF NEW.charges IS NOT NULL AND jsonb_typeof(NEW.charges) = 'array' THEN
        FOR charge IN SELECT * FROM jsonb_array_elements(NEW.charges)
        LOOP
            charge_amt := COALESCE((charge->>'amount')::NUMERIC, 0);
            IF charge_amt > 0 THEN
                charges_total := charges_total + charge_amt;
            END IF;
        END LOOP;
    END IF;

    -- The bird-sale portion is the grand total minus charges.
    bird_total := NEW.total_amount - charges_total;
    IF bird_total < 0 THEN
        bird_total := 0;
        charges_total := NEW.total_amount;
    END IF;

    tot_rec := COALESCE(NEW.received_cash, 0) + COALESCE(NEW.received_ac, 0);
    calced_new_bal := cur_bal + NEW.total_amount - tot_rec;

    NEW.previous_balance := cur_bal;
    NEW.new_balance := calced_new_bal;

    -- 1) Bird sale row.
    run_bal := cur_bal + bird_total;
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
        bird_total, 0,
        run_bal,
        'invoice', NEW.id,
        NEW.mandi_rate_per_40kg, NEW.sale_rate_per_40kg, NEW.net_weight_kg,
        NEW.created_by
    );

    -- 2) One debit row per extra charge (labour, loading, custom).
    IF NEW.charges IS NOT NULL AND jsonb_typeof(NEW.charges) = 'array' THEN
        FOR charge IN SELECT * FROM jsonb_array_elements(NEW.charges)
        LOOP
            charge_amt := COALESCE((charge->>'amount')::NUMERIC, 0);
            charge_name := NULLIF(TRIM(COALESCE(charge->>'name', '')), '');
            IF charge_name IS NULL THEN charge_name := 'Extra charge'; END IF;
            IF charge_amt > 0 THEN
                run_bal := run_bal + charge_amt;
                INSERT INTO public.ledger_entries (
                    party_id, entry_date, detail, detail_urdu, folio_no,
                    debit, credit, running_balance, ref_type, ref_id, created_by
                ) VALUES (
                    NEW.customer_id,
                    NEW.invoice_date,
                    CONCAT('Charge: ', charge_name, ' (Rs ', charge_amt, ')'),
                    CONCAT('اخراجات: ', charge_name, ' (', charge_amt, ' روپے)'),
                    NEW.invoice_number,
                    charge_amt, 0,
                    run_bal,
                    'invoice_charge', NEW.id,
                    NEW.created_by
                );
            END IF;
        END LOOP;
    END IF;

    -- 3) Payment row (unchanged).
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

-- ---------------------------------------------------------------------------
-- PART A3 — void_invoice(): also reverse 'invoice_charge' rows
-- ---------------------------------------------------------------------------

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
      AND ref_type IN ('invoice', 'invoice_payment', 'invoice_charge')
      AND COALESCE(is_void, false) = false;

    -- Post reversal rows, newest first, so running balances stay truthful.
    SELECT current_balance INTO v_bal FROM public.parties WHERE id = v_inv.customer_id FOR UPDATE;
    v_tot_rec := COALESCE(v_inv.received_cash, 0) + COALESCE(v_inv.received_ac, 0);

    FOR v_led IN
        SELECT * FROM public.ledger_entries
        WHERE ref_id = p_invoice_id AND ref_type IN ('invoice', 'invoice_payment', 'invoice_charge')
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

-- ---------------------------------------------------------------------------
-- PART B — edit_ledger_entry(): correct a ledger row end-to-end
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.edit_ledger_entry(
    p_entry_id UUID,
    p_entry_date DATE,
    p_detail TEXT,
    p_detail_urdu TEXT,
    p_debit NUMERIC,
    p_credit NUMERIC,
    p_ref_id UUID DEFAULT NULL,
    p_ref_type TEXT DEFAULT NULL,
    p_party_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role TEXT;
    v_row RECORD;
    v_bal NUMERIC(14,2) := 0;
    v_r RECORD;
BEGIN
    SELECT role::TEXT INTO v_role FROM public.profiles WHERE id = auth.uid();
    IF v_role IS NULL OR v_role NOT IN ('owner', 'manager', 'accountant') THEN
        RAISE EXCEPTION 'edit_ledger_entry: role % is not permitted', COALESCE(v_role, 'none');
    END IF;

    SELECT * INTO v_row FROM public.ledger_entries WHERE id = p_entry_id FOR UPDATE;

    -- Fallback for optimistic client ids that never reach the server: match
    -- the server row by its stable document reference instead.
    IF NOT FOUND AND p_ref_id IS NOT NULL THEN
        SELECT * INTO v_row FROM public.ledger_entries
        WHERE ref_id = p_ref_id
          AND ref_type = p_ref_type
          AND party_id = p_party_id
        ORDER BY created_at
        LIMIT 1
        FOR UPDATE;
    END IF;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'edit_ledger_entry: entry % not found', p_entry_id;
    END IF;
    IF COALESCE(v_row.is_void, false) THEN
        RAISE EXCEPTION 'edit_ledger_entry: voided entries cannot be edited';
    END IF;

    -- Amount changes are only allowed on manually maintained rows. Amounts on
    -- document-posted rows are owned by their source document (edit or void
    -- the document itself instead).
    IF v_row.ref_type NOT IN ('adjustment', 'opening', 'journal')
       AND (COALESCE(p_debit, v_row.debit) <> COALESCE(v_row.debit, 0)
            OR COALESCE(p_credit, v_row.credit) <> COALESCE(v_row.credit, 0)) THEN
        RAISE EXCEPTION 'edit_ledger_entry: amount of a % row is owned by its document — edit the document instead', v_row.ref_type;
    END IF;

    UPDATE public.ledger_entries
    SET entry_date = p_entry_date,
        detail = NULLIF(TRIM(p_detail), ''),
        detail_urdu = NULLIF(TRIM(COALESCE(p_detail_urdu, '')), ''),
        debit = GREATEST(0, COALESCE(p_debit, debit)),
        credit = GREATEST(0, COALESCE(p_credit, credit))
    WHERE id = v_row.id;

    -- Recompute the party's running balances in chronological order.
    -- Voided rows are excluded: their reversal rows carry the correction.
    FOR v_r IN
        SELECT id, debit, credit FROM public.ledger_entries
        WHERE party_id = v_row.party_id AND COALESCE(is_void, false) = false
        ORDER BY entry_date, created_at, id
    LOOP
        v_bal := v_bal + COALESCE(v_r.debit, 0) - COALESCE(v_r.credit, 0);
        UPDATE public.ledger_entries SET running_balance = v_bal WHERE id = v_r.id;
    END LOOP;

    UPDATE public.parties SET current_balance = v_bal WHERE id = v_row.party_id;

    -- Keep parties.opening_balance in sync when the opening row was edited.
    IF v_row.ref_type = 'opening' THEN
        UPDATE public.parties
        SET opening_balance = GREATEST(0, COALESCE(p_debit, 0)) - GREATEST(0, COALESCE(p_credit, 0))
        WHERE id = v_row.party_id;
    END IF;
END;
$$;
