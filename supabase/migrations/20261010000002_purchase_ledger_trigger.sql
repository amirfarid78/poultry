-- ============================================================================
-- MURGH MANDI ERP: PURCHASE LEDGER TRIGGER
-- ============================================================================
-- Invoices and receipts post to ledger_entries via BEFORE INSERT triggers
-- (see 20240101000000_initial_poultry_schema.sql). Purchases had no trigger,
-- so supplier balances / khata rows depended on the client. This adds the
-- same server-side guarantee: the trigger computes previous/new balances,
-- posts the ledger row, and updates the supplier's current_balance atomically.
-- Client inserts must NOT send previous_balance / new_balance (overwritten)
-- and must never write ledger_entries directly.
-- ============================================================================

CREATE OR REPLACE FUNCTION process_purchase_ledger()
RETURNS TRIGGER AS $$
DECLARE
    cur_bal NUMERIC(14,2);
    paid NUMERIC(14,2);
    calced_new_bal NUMERIC(14,2);
BEGIN
    SELECT current_balance INTO cur_bal FROM parties WHERE id = NEW.supplier_id FOR UPDATE;

    paid := COALESCE(NEW.paid_cash, 0) + COALESCE(NEW.paid_bank, 0);
    calced_new_bal := cur_bal + NEW.total_amount - paid;

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
        NEW.supplier_id,
        NEW.purchase_date,
        CONCAT('Purchase: ', NEW.net_weight_kg, ' kg @ Rs ', NEW.rate_per_40kg, '/40kg'),
        CONCAT('مال خریداری: ', NEW.net_weight_kg, ' کلو، ریٹ ', NEW.rate_per_40kg),
        NEW.purchase_number,
        NEW.total_amount,
        paid,
        calced_new_bal,
        'purchase',
        NEW.id,
        NEW.created_by
    );

    UPDATE parties SET current_balance = calced_new_bal WHERE id = NEW.supplier_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_purchase_ledger ON purchases;
CREATE TRIGGER trg_purchase_ledger
BEFORE INSERT ON purchases
FOR EACH ROW
EXECUTE FUNCTION process_purchase_ledger();
