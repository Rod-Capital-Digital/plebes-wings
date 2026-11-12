-- Run only against an isolated local database or a disposable Supabase branch
-- after applying migration 07. Never run this file in production.
-- It creates temporary test identities and catalog rows, then rolls everything back.
BEGIN;

INSERT INTO auth.users (id)
VALUES
  ('70000000-0000-0000-0000-000000000001'),
  ('70000000-0000-0000-0000-000000000002'),
  ('70000000-0000-0000-0000-000000000003');

INSERT INTO public.pw_members (user_id, display_name, role, branch_id, active)
VALUES
  ('70000000-0000-0000-0000-000000000001', 'RLS Owner', 'owner', NULL, true),
  ('70000000-0000-0000-0000-000000000002', 'RLS Consultant', 'consultant', NULL, true),
  ('70000000-0000-0000-0000-000000000003', 'RLS Employee Mora', 'employee', 'mora', true);

-- Owner can create an inactive supplier. The audit trigger must ignore a forged
-- creator and attribute the row to the authenticated owner.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000001', true);
INSERT INTO public.pw_suppliers (name, active, created_by)
VALUES ('RLS supplier inactive', false, '70000000-0000-0000-0000-000000000003');
RESET ROLE;

DO $check$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.pw_suppliers
    WHERE name = 'RLS supplier inactive'
      AND created_by = '70000000-0000-0000-0000-000000000001'
      AND updated_by = '70000000-0000-0000-0000-000000000001'
  ) THEN
    RAISE EXCEPTION 'Audit trigger did not attribute owner-created supplier correctly';
  END IF;
END;
$check$;

-- A consultant sees only active supplier rows and cannot reactivate the owner row.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000002', true);
DO $check$
BEGIN
  IF EXISTS (SELECT 1 FROM public.pw_suppliers WHERE name = 'RLS supplier inactive') THEN
    RAISE EXCEPTION 'Consultant can read an inactive supplier';
  END IF;

  UPDATE public.pw_suppliers SET active = true WHERE name = 'RLS supplier inactive';
  IF FOUND THEN
    RAISE EXCEPTION 'Consultant unexpectedly updated an inactive supplier';
  END IF;
END;
$check$;
RESET ROLE;

-- An employee can read active inventory items and only the location of La Mora.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000003', true);
DO $check$
DECLARE
  v_locations text[];
BEGIN
  SELECT array_agg(id ORDER BY id) INTO v_locations
  FROM public.pw_stock_locations;

  IF v_locations IS DISTINCT FROM ARRAY['mora']::text[] THEN
    RAISE EXCEPTION 'Employee location scope is %, expected {mora}', v_locations;
  END IF;

  BEGIN
    INSERT INTO public.pw_inventory_items (name, item_type, base_unit)
    VALUES ('Unauthorized employee item', 'consumable', 'pieza');
    RAISE EXCEPTION 'Employee unexpectedly inserted an inventory item';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$check$;
RESET ROLE;

ROLLBACK;
