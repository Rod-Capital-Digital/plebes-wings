-- Run only against a local database or a staging branch after applying migration 07.
-- It is read-only: it inserts no business rows and does not invoke sales RPCs.
BEGIN READ ONLY;

DO $check$
DECLARE
  required_table text;
  required_policy text;
BEGIN
  FOREACH required_table IN ARRAY ARRAY[
    'pw_suppliers', 'pw_inventory_items', 'pw_stock_locations'
  ] LOOP
    IF to_regclass('public.' || required_table) IS NULL THEN
      RAISE EXCEPTION 'Missing table public.%', required_table;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = required_table AND c.relrowsecurity
    ) THEN
      RAISE EXCEPTION 'RLS is not enabled on public.%', required_table;
    END IF;
  END LOOP;

  FOREACH required_policy IN ARRAY ARRAY[
    'pw_suppliers_owner_all',
    'pw_suppliers_manager_active',
    'pw_inventory_items_owner_all',
    'pw_inventory_items_manager_active',
    'pw_inventory_items_member_read_active',
    'pw_stock_locations_owner_all',
    'pw_stock_locations_manager_read_active',
    'pw_stock_locations_branch_read_active'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND policyname = required_policy
    ) THEN
      RAISE EXCEPTION 'Missing RLS policy %', required_policy;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.pw_inventory_items'::regclass
      AND contype = 'f'
      AND confrelid = 'public.pw_products'::regclass
  ) THEN
    RAISE EXCEPTION 'pw_inventory_items is missing its pw_products foreign key';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.pw_stock_locations'::regclass
      AND contype = 'f'
      AND confrelid = 'public.pw_branches'::regclass
  ) THEN
    RAISE EXCEPTION 'pw_stock_locations is missing its pw_branches foreign key';
  END IF;

  IF has_table_privilege('anon', 'public.pw_suppliers', 'delete')
     OR has_table_privilege('authenticated', 'public.pw_suppliers', 'delete')
     OR has_table_privilege('anon', 'public.pw_inventory_items', 'delete')
     OR has_table_privilege('authenticated', 'public.pw_inventory_items', 'delete')
     OR has_table_privilege('anon', 'public.pw_stock_locations', 'delete')
     OR has_table_privilege('authenticated', 'public.pw_stock_locations', 'delete') THEN
    RAISE EXCEPTION 'A client role has an unexpected DELETE grant';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'private'
      AND p.proname = 'pw_set_catalog_audit_fields'
      AND p.prosecdef
  ) THEN
    RAISE EXCEPTION 'Catalog audit trigger function must be SECURITY INVOKER';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.pw_suppliers'::regclass
      AND tgname = 'pw_suppliers_set_audit_fields'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'Supplier audit trigger is missing';
  END IF;

  IF (SELECT count(*) FROM public.pw_stock_locations
      WHERE id IN ('central', 'mora', 'santacruz')) <> 3 THEN
    RAISE EXCEPTION 'One or more required seeded stock locations is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.pw_stock_locations
    WHERE id = 'central' AND location_type = 'central' AND branch_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Central stock location is invalid';
  END IF;

  IF (SELECT count(*) FROM public.pw_stock_locations
      WHERE location_type = 'branch' AND branch_id IN ('mora', 'santacruz')) <> 2 THEN
    RAISE EXCEPTION 'Branch stock locations are incomplete';
  END IF;
END;
$check$;

SELECT table_name, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('pw_suppliers', 'pw_inventory_items', 'pw_stock_locations')
ORDER BY table_name;

SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('pw_suppliers', 'pw_inventory_items', 'pw_stock_locations')
ORDER BY tablename, policyname;

SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('pw_suppliers', 'pw_inventory_items', 'pw_stock_locations')
  AND grantee IN ('anon', 'authenticated')
ORDER BY table_name, grantee, privilege_type;

SELECT id, name, location_type, branch_id, active
FROM public.pw_stock_locations
ORDER BY id;

ROLLBACK;
