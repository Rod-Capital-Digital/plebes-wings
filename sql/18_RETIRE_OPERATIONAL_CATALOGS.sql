-- Plebes Wings / 18 - controlled retirement of suppliers and inventory items.
-- Apply after migration 12. This intentionally does not hard-delete
-- catalog rows: purchase and inventory history must remain referentially intact.
BEGIN;

CREATE OR REPLACE FUNCTION public.pw_retire_operational_catalog_v1(p_kind text, p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_actor uuid := auth.uid();
  v_kind text := lower(btrim(coalesce(p_kind,'')));
  v_name text;
  v_has_history boolean := false;
BEGIN
  IF v_actor IS NULL OR NOT private.pw_is_manager() THEN
    RAISE EXCEPTION 'No autorizado para eliminar registros del catálogo.' USING ERRCODE='42501';
  END IF;
  IF p_id IS NULL OR v_kind NOT IN ('supplier','item') THEN
    RAISE EXCEPTION 'Solicitud de eliminación de catálogo inválida.';
  END IF;

  IF v_kind='supplier' THEN
    SELECT name INTO v_name FROM public.pw_suppliers WHERE id=p_id AND active FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Proveedor inexistente o ya eliminado.'; END IF;

    -- Supplier-item links are introduced by migration 17. Retire them when that
    -- optional module is present, while keeping this migration valid from 12.
    IF pg_catalog.to_regclass('public.pw_supplier_inventory_items') IS NOT NULL THEN
      EXECUTE 'UPDATE public.pw_supplier_inventory_items
        SET active=false, preferred=false, updated_by=$2, updated_at=now()
        WHERE supplier_id=$1 AND active'
      USING p_id, v_actor;
    END IF;
    UPDATE public.pw_suppliers
      SET active=false, updated_by=v_actor, updated_at=now()
      WHERE id=p_id;
    INSERT INTO public.pw_audit_events(user_id,module,action,entity_id,metadata)
      VALUES(v_actor,'purchases','supplier_retired',p_id::text,jsonb_build_object('name',v_name));
  ELSE
    SELECT name INTO v_name FROM public.pw_inventory_items WHERE id=p_id AND active FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Insumo inexistente o ya eliminado.'; END IF;

    -- Hiding an item that has operational history would conceal balances or
    -- compromise traceability. It must remain active and be corrected instead.
    v_has_history := EXISTS (SELECT 1 FROM public.pw_purchase_lines WHERE item_id=p_id)
      OR EXISTS (SELECT 1 FROM public.pw_inventory_movements WHERE item_id=p_id);
    IF NOT v_has_history AND pg_catalog.to_regclass('public.pw_branch_delivery_lines') IS NOT NULL THEN
      EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.pw_branch_delivery_lines WHERE item_id=$1)'
        INTO v_has_history USING p_id;
    END IF;
    IF NOT v_has_history AND pg_catalog.to_regclass('public.pw_recipe_lines') IS NOT NULL THEN
      EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.pw_recipe_lines WHERE item_id=$1)'
        INTO v_has_history USING p_id;
    END IF;
    IF NOT v_has_history AND pg_catalog.to_regclass('public.pw_inventory_item_costs') IS NOT NULL THEN
      EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.pw_inventory_item_costs WHERE item_id=$1)'
        INTO v_has_history USING p_id;
    END IF;
    IF v_has_history THEN
      RAISE EXCEPTION 'No se puede eliminar un insumo con compras, movimientos, entregas o recetas asociadas.';
    END IF;

    IF pg_catalog.to_regclass('public.pw_supplier_inventory_items') IS NOT NULL THEN
      EXECUTE 'UPDATE public.pw_supplier_inventory_items
        SET active=false, preferred=false, updated_by=$2, updated_at=now()
        WHERE item_id=$1 AND active'
      USING p_id, v_actor;
    END IF;
    UPDATE public.pw_inventory_items
      SET active=false, updated_by=v_actor, updated_at=now()
      WHERE id=p_id;
    INSERT INTO public.pw_audit_events(user_id,module,action,entity_id,metadata)
      VALUES(v_actor,'inventory','item_retired',p_id::text,jsonb_build_object('name',v_name));
  END IF;

  RETURN jsonb_build_object('id',p_id,'kind',v_kind,'retired',true);
END;
$fn$;

REVOKE ALL ON FUNCTION public.pw_retire_operational_catalog_v1(text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pw_retire_operational_catalog_v1(text,uuid) TO authenticated;

COMMIT;
