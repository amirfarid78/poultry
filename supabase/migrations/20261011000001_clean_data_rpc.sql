-- ============================================================================
-- CLEAN ALL DATA RPC (Danger zone — owner only)
-- ============================================================================
-- public.clean_all_data() wipes every business table so the app can be reset
-- to a blank slate from Settings → Danger zone. It NEVER touches auth.users
-- or public.profiles (accounts and roles are preserved).
--
-- SECURITY DEFINER: runs with the function owner's rights so it can TRUNCATE
-- regardless of RLS. The owner-role guard is enforced inside the function.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.clean_all_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF public.current_user_role() IS DISTINCT FROM 'owner' THEN
        RAISE EXCEPTION 'clean_all_data: only users with the owner role can delete all business data';
    END IF;

    -- Reverse-dependency order is not required with CASCADE, but the explicit
    -- list documents intent. profiles and auth.users are deliberately absent.
    TRUNCATE public.whatsapp_share_logs,
             public.audit_logs,
             public.journal_lines,
             public.journal_entries,
             public.ledger_entries,
             public.receipts,
             public.invoices,
             public.purchases,
             public.orders,
             public.trips,
             public.trip_pings,
             public.vehicles,
             public.employee_advances,
             public.payroll,
             public.employees,
             public.day_closings,
             public.mandi_rates,
             public.products,
             public.parties,
             public.chart_of_accounts,
             public.expenses
    RESTART IDENTITY CASCADE;
END;
$$;

-- Keep the function out of anon/authenticated default grants; it is invoked
-- via supabase.rpc() which runs with the caller's JWT (guarded above).
REVOKE ALL ON FUNCTION public.clean_all_data() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clean_all_data() TO authenticated;
