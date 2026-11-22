-- ============================================================================
-- NAWAZ POULTRY ERP — INVOICE LEDGER NET-WEIGHT FIX (W6)
-- ============================================================================
-- Problem: process_invoice_ledger() is a BEFORE INSERT trigger that reads
--   NEW.net_weight_kg for the sale row's detail strings and the weight_kg
--   column — but net_weight_kg is a GENERATED column
--   (gross_weight_kg - shrinkage_kg STORED), which is NOT yet computed in a
--   BEFORE INSERT trigger, so NEW.net_weight_kg is NULL and khata sale rows
--   show a blank kg ("Sale:  kg @ Rs ...") with weight_kg NULL.
-- Fix:
--   (a) process_invoice_ledger() now computes
--       v_net_kg := COALESCE(NEW.gross_weight_kg, 0)
--                - COALESCE(NEW.shrinkage_kg, 0)
--       and uses v_net_kg in the CONCAT detail strings and weight_kg.
--       Everything else is identical to the latest version in
--       20261023000001_invoice_charges.sql (charges + payment rows).
--   (b) Backfill existing 'invoice' ledger rows: rebuild detail /
--       detail_urdu + weight_kg from the joined invoices row where
--       weight_kg IS NULL (or the detail shows the blank-kg pattern).
--       VOID reversal rows (ref_type 'invoice', detail starting with
--       'VOID reversal: ', is_void false — that is how void_invoice()
--       marks them; the original rows it reverses are flagged is_void)
--       get weight_kg only, never a rewritten detail.
--   Note: purchases.net_weight_kg is a regular column, so the purchase
--   trigger has no such bug — it is not touched.
-- Self-contained: safe to re-run. Run AFTER 20261122000002.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- PART A — process_invoice_ledger(): compute net kg from gross - shrinkage
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
    -- net_weight_kg is GENERATED (gross - shrinkage) STORED: in a BEFORE
    -- INSERT trigger it is not computed yet, so NEW.net_weight_kg is NULL.
    -- Compute it from the two source columns instead.
    v_net_kg NUMERIC(14,2);
BEGIN
    SELECT current_balance INTO cur_bal FROM public.parties WHERE id = NEW.customer_id FOR UPDATE;

    v_net_kg := COALESCE(NEW.gross_weight_kg, 0) - COALESCE(NEW.shrinkage_kg, 0);

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
        CONCAT('Sale: ', v_net_kg, ' kg @ Rs ', NEW.sale_rate_per_40kg, '/40kg'),
        CONCAT('مرغ فروخت: ', v_net_kg, ' کلو، ریٹ ', NEW.sale_rate_per_40kg),
        NEW.invoice_number,
        bird_total, 0,
        run_bal,
        'invoice', NEW.id,
        NEW.mandi_rate_per_40kg, NEW.sale_rate_per_40kg, v_net_kg,
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
-- PART B — backfill existing 'invoice' ledger rows from the joined invoice.
--   Original sale rows (detail 'Sale: ...'): rebuild detail/detail_urdu +
--   weight_kg where weight_kg IS NULL or the detail has the blank-kg
--   pattern ('Sale:  kg'). VOID reversal rows (detail starts with
--   'VOID reversal: ') get weight_kg only — their detail must stay verbatim.
-- ---------------------------------------------------------------------------

-- B1: VOID reversal rows — weight_kg only.
UPDATE public.ledger_entries le
SET weight_kg = COALESCE(i.gross_weight_kg, 0) - COALESCE(i.shrinkage_kg, 0)
FROM public.invoices i
WHERE le.ref_id = i.id
  AND le.ref_type = 'invoice'
  AND le.detail LIKE 'VOID reversal:%'
  AND le.weight_kg IS NULL;

-- B2: original sale rows — rebuild detail/detail_urdu + weight_kg.
UPDATE public.ledger_entries le
SET detail = CONCAT('Sale: ', COALESCE(i.gross_weight_kg, 0) - COALESCE(i.shrinkage_kg, 0), ' kg @ Rs ', i.sale_rate_per_40kg, '/40kg'),
    detail_urdu = CONCAT('مرغ فروخت: ', COALESCE(i.gross_weight_kg, 0) - COALESCE(i.shrinkage_kg, 0), ' کلو، ریٹ ', i.sale_rate_per_40kg),
    weight_kg = COALESCE(i.gross_weight_kg, 0) - COALESCE(i.shrinkage_kg, 0)
FROM public.invoices i
WHERE le.ref_id = i.id
  AND le.ref_type = 'invoice'
  AND le.detail NOT LIKE 'VOID reversal:%'
  AND (le.weight_kg IS NULL OR le.detail LIKE 'Sale:  kg%');
