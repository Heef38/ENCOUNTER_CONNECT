-- Migration 007: appointment colors
--
-- Adds two color columns so admins can assign a default color per appointment
-- type (and later override per-booking). Both nullable; the calendar falls
-- back to a deterministic hash color when null.
--
-- Multi-tenancy note: scheduling_appointment_types is shared across churches
-- (a pre-existing scheduling-core decision, predates EC multi-tenancy).
-- Type colors are therefore global. If per-church type colors are needed
-- later, this becomes a join table (church_id, appointment_type_id, color).

ALTER TABLE public.scheduling_appointment_types
  ADD COLUMN color TEXT;

ALTER TABLE public.scheduling_bookings
  ADD COLUMN display_color TEXT;

COMMENT ON COLUMN public.scheduling_appointment_types.color IS
  'Default hex color (e.g. #14b8a6) used by the EC calendar when rendering bookings of this type.';

COMMENT ON COLUMN public.scheduling_bookings.display_color IS
  'Per-booking color override that highlights a specific session. Wins over the type default.';

-- ── RLS: let EC admins manage colors ─────────────────────────
-- The original scheduling RLS gates appointment_types behind
-- scheduling_has_role('manager'). EC admins are not in that role system,
-- so we add overlapping policies. Existing policies stay intact.

CREATE POLICY "ec admins can read all appointment types"
  ON public.scheduling_appointment_types FOR SELECT
  USING (ec_is_platform_admin() OR ec_has_role('church_admin'));

CREATE POLICY "ec admins can update appointment types"
  ON public.scheduling_appointment_types FOR UPDATE
  USING (ec_is_platform_admin() OR ec_has_role('church_admin'))
  WITH CHECK (ec_is_platform_admin() OR ec_has_role('church_admin'));
