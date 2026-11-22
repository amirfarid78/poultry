-- ============================================================================
-- NAWAZ POULTRY ERP — ORDER / TRIP COLUMNS + INVOICE NOTES (P1-20 / P1-21
--   / P1-12)
-- ============================================================================
-- Problem: orders has no assigned vehicle/driver columns (only
--   assigned_trip_id), so the app could not record which vehicle/driver an
--   order was assigned to; trips has no stops / delivered_kg columns, so
--   per-stop delivery progress was session-only. Also, the Invoice type
--   carries notes but the invoices table has no notes column (verified in
--   the v1 schema: invoices has void_reason only), so rowInvoice could
--   never persist it.
-- Fix: add the columns (all IF NOT EXISTS — safe to re-run). Path/GPS
--   trail stays session-only (trip_pings already stores live pings).
-- Self-contained: safe to re-run. Run AFTER 20261122000003.
-- ============================================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS assigned_vehicle_id UUID REFERENCES public.vehicles(id),
  ADD COLUMN IF NOT EXISTS assigned_driver_id UUID REFERENCES public.profiles(id);

ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS stops JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS delivered_kg NUMERIC DEFAULT 0;

-- P1-12: invoices.notes — the Invoice type has notes? but the table never
--   had the column, so rowInvoice (src/lib/db.ts) now sends it.
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS notes TEXT;
