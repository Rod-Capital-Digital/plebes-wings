-- REVIEW-ONLY MIGRATION: do not run against production before review and staging validation.
-- Plebes Wings: operational catalogs for suppliers, inventory items and stock locations.
-- Target: plebes-wings-prod / rilrfcmmylldftioapnc
-- This migration is additive. It does not alter legacy tables, sales RPCs, policies or records.
BEGIN;

-- System-created seed rows intentionally have a NULL actor. Browser-created rows
-- are constrained by RLS to the authenticated actor. The trigger preserves the
-- original creator and always records the authenticated updater.
CREATE OR REPLACE FUNCTION private.pw_set_catalog_audit_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- System seeds are intentionally actorless. Any browser/API write receives
    -- the authenticated actor regardless of values supplied by the client.
    IF v_actor IS NOT NULL THEN
      NEW.created_by := v_actor;
    END IF;
    NEW.created_at := pg_catalog.now();
  ELSE
    NEW.created_at := OLD.created_at;
    NEW.created_by := OLD.created_by;
  END IF;

  NEW.updated_at := pg_catalog.now();
  NEW.updated_by := v_actor;
  RETURN NEW;
END;
$fn$;

CREATE TABLE IF NOT EXISTS public.pw_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  legal_name text,
  tax_id text,
  contact_name text,
  contact_email text,
  contact_phone text,
  payment_terms_days smallint NOT NULL DEFAULT 0,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pw_suppliers_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT pw_suppliers_tax_id_not_blank CHECK (tax_id IS NULL OR btrim(tax_id) <> ''),
  CONSTRAINT pw_suppliers_payment_terms_range CHECK (payment_terms_days BETWEEN 0 AND 365),
  CONSTRAINT pw_suppliers_email_not_blank CHECK (contact_email IS NULL OR btrim(contact_email) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS pw_suppliers_name_normalized_key
  ON public.pw_suppliers (lower(btrim(name)));
CREATE UNIQUE INDEX IF NOT EXISTS pw_suppliers_tax_id_normalized_key
  ON public.pw_suppliers (lower(btrim(tax_id)))
  WHERE tax_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS pw_suppliers_active_name_idx
  ON public.pw_suppliers (active, name);
CREATE INDEX IF NOT EXISTS pw_suppliers_created_by_idx
  ON public.pw_suppliers (created_by);

CREATE TABLE IF NOT EXISTS public.pw_inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text,
  name text NOT NULL,
  item_type text NOT NULL,
  base_unit text NOT NULL,
  product_id text REFERENCES public.pw_products(id) ON DELETE RESTRICT,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pw_inventory_items_sku_not_blank CHECK (sku IS NULL OR btrim(sku) <> ''),
  CONSTRAINT pw_inventory_items_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT pw_inventory_items_type CHECK (
    item_type IN ('raw_material', 'packaging', 'consumable', 'semi_finished', 'finished_good')
  ),
  CONSTRAINT pw_inventory_items_base_unit_not_blank CHECK (btrim(base_unit) <> ''),
  CONSTRAINT pw_inventory_items_product_mapping CHECK (
    product_id IS NULL OR item_type = 'finished_good'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS pw_inventory_items_sku_normalized_key
  ON public.pw_inventory_items (lower(btrim(sku)))
  WHERE sku IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS pw_inventory_items_name_type_unit_key
  ON public.pw_inventory_items (item_type, lower(btrim(name)), lower(btrim(base_unit)));
CREATE UNIQUE INDEX IF NOT EXISTS pw_inventory_items_product_id_key
  ON public.pw_inventory_items (product_id)
  WHERE product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS pw_inventory_items_active_type_name_idx
  ON public.pw_inventory_items (active, item_type, name);
CREATE INDEX IF NOT EXISTS pw_inventory_items_created_by_idx
  ON public.pw_inventory_items (created_by);

CREATE TABLE IF NOT EXISTS public.pw_stock_locations (
  id text PRIMARY KEY,
  name text NOT NULL,
  location_type text NOT NULL,
  branch_id text UNIQUE REFERENCES public.pw_branches(id) ON DELETE RESTRICT,
  description text,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pw_stock_locations_id_not_blank CHECK (btrim(id) <> ''),
  CONSTRAINT pw_stock_locations_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT pw_stock_locations_type CHECK (location_type IN ('central', 'branch')),
  CONSTRAINT pw_stock_locations_branch_mapping CHECK (
    (location_type = 'central' AND branch_id IS NULL) OR
    (location_type = 'branch' AND branch_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS pw_stock_locations_name_normalized_key
  ON public.pw_stock_locations (lower(btrim(name)));
CREATE INDEX IF NOT EXISTS pw_stock_locations_active_branch_idx
  ON public.pw_stock_locations (active, branch_id);
CREATE INDEX IF NOT EXISTS pw_stock_locations_created_by_idx
  ON public.pw_stock_locations (created_by);

DROP TRIGGER IF EXISTS pw_suppliers_set_audit_fields ON public.pw_suppliers;
CREATE TRIGGER pw_suppliers_set_audit_fields
BEFORE INSERT OR UPDATE ON public.pw_suppliers
FOR EACH ROW EXECUTE FUNCTION private.pw_set_catalog_audit_fields();

DROP TRIGGER IF EXISTS pw_inventory_items_set_audit_fields ON public.pw_inventory_items;
CREATE TRIGGER pw_inventory_items_set_audit_fields
BEFORE INSERT OR UPDATE ON public.pw_inventory_items
FOR EACH ROW EXECUTE FUNCTION private.pw_set_catalog_audit_fields();

DROP TRIGGER IF EXISTS pw_stock_locations_set_audit_fields ON public.pw_stock_locations;
CREATE TRIGGER pw_stock_locations_set_audit_fields
BEFORE INSERT OR UPDATE ON public.pw_stock_locations
FOR EACH ROW EXECUTE FUNCTION private.pw_set_catalog_audit_fields();

-- Stock locations identify the central warehouse and the two existing branches.
-- No inventory quantity or movement is created by these catalog rows.
INSERT INTO public.pw_stock_locations (id, name, location_type, branch_id, description)
VALUES
  ('central', 'Almacén central', 'central', NULL, 'Preparación y resguardo central.'),
  ('mora', 'La Mora', 'branch', 'mora', 'Punto de venta La Mora.'),
  ('santacruz', 'Santa Cruz Atzcapotzaltongo', 'branch', 'santacruz', 'Punto de venta Santa Cruz Atzcapotzaltongo.')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.pw_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pw_inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pw_stock_locations ENABLE ROW LEVEL SECURITY;

-- A public-schema table may inherit API grants. Start closed, then grant only
-- operations guarded by the policies below. No client role can delete catalog rows.
REVOKE ALL ON TABLE public.pw_suppliers, public.pw_inventory_items, public.pw_stock_locations
  FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.pw_suppliers, public.pw_inventory_items, public.pw_stock_locations
  TO authenticated;

-- Owners can inspect and manage all catalog rows, including inactive rows.
DROP POLICY IF EXISTS pw_suppliers_owner_all ON public.pw_suppliers;
CREATE POLICY pw_suppliers_owner_all
ON public.pw_suppliers FOR ALL TO authenticated
USING ((SELECT private.pw_is_owner()))
WITH CHECK (
  (SELECT private.pw_is_owner())
  AND updated_by = (SELECT auth.uid())
);

DROP POLICY IF EXISTS pw_inventory_items_owner_all ON public.pw_inventory_items;
CREATE POLICY pw_inventory_items_owner_all
ON public.pw_inventory_items FOR ALL TO authenticated
USING ((SELECT private.pw_is_owner()))
WITH CHECK (
  (SELECT private.pw_is_owner())
  AND updated_by = (SELECT auth.uid())
);

DROP POLICY IF EXISTS pw_stock_locations_owner_all ON public.pw_stock_locations;
CREATE POLICY pw_stock_locations_owner_all
ON public.pw_stock_locations FOR ALL TO authenticated
USING ((SELECT private.pw_is_owner()))
WITH CHECK (
  (SELECT private.pw_is_owner())
  AND updated_by = (SELECT auth.uid())
);

-- Consultants operate active suppliers and items but cannot expose or reactivate
-- retired records. Locations remain owner-managed because they define stock scope.
DROP POLICY IF EXISTS pw_suppliers_manager_active ON public.pw_suppliers;
CREATE POLICY pw_suppliers_manager_active
ON public.pw_suppliers FOR ALL TO authenticated
USING ((SELECT private.pw_is_manager()) AND active)
WITH CHECK (
  (SELECT private.pw_is_manager())
  AND active
  AND updated_by = (SELECT auth.uid())
);

DROP POLICY IF EXISTS pw_inventory_items_manager_active ON public.pw_inventory_items;
CREATE POLICY pw_inventory_items_manager_active
ON public.pw_inventory_items FOR ALL TO authenticated
USING ((SELECT private.pw_is_manager()) AND active)
WITH CHECK (
  (SELECT private.pw_is_manager())
  AND active
  AND updated_by = (SELECT auth.uid())
);

DROP POLICY IF EXISTS pw_stock_locations_manager_read_active ON public.pw_stock_locations;
CREATE POLICY pw_stock_locations_manager_read_active
ON public.pw_stock_locations FOR SELECT TO authenticated
USING ((SELECT private.pw_is_manager()) AND active);

-- Employees only need the active item catalog and their assigned active location.
-- They cannot see supplier commercial information or the central warehouse.
DROP POLICY IF EXISTS pw_inventory_items_member_read_active ON public.pw_inventory_items;
CREATE POLICY pw_inventory_items_member_read_active
ON public.pw_inventory_items FOR SELECT TO authenticated
USING ((SELECT private.pw_is_active_member()) AND active);

DROP POLICY IF EXISTS pw_stock_locations_branch_read_active ON public.pw_stock_locations;
CREATE POLICY pw_stock_locations_branch_read_active
ON public.pw_stock_locations FOR SELECT TO authenticated
USING (
  active
  AND branch_id IS NOT NULL
  AND (SELECT private.pw_can_read_branch(branch_id))
);

COMMIT;
