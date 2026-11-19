-- Plebes Wings / 19 - permanent deletion of unused suppliers and inventory items.
-- Apply after migration 18. Records with operational history remain protected.
BEGIN;

CREATE OR REPLACE FUNCTION public.pw_delete_operational_catalog_v1(p_kind text, p_id uuid)
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
    SELECT name INTO v_name FROM public.pw_suppliers WHERE id=p_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Proveedor inexistente.'; END IF;
    IF EXISTS (SELECT 1 FROM public.pw_purchase_documents WHERE supplier_id=p_id) THEN
      RAISE EXCEPTION 'No se puede eliminar un proveedor con compras asociadas.';
    END IF;
    IF pg_catalog.to_regclass('public.pw_supplier_inventory_items') IS NOT NULL THEN
      EXECUTE 'DELETE FROM public.pw_supplier_inventory_items WHERE supplier_id=$1' USING p_id;
    END IF;
    DELETE FROM public.pw_suppliers WHERE id=p_id;
    INSERT INTO public.pw_audit_events(user_id,module,action,entity_id,metadata)
      VALUES(v_actor,'purchases','supplier_deleted',p_id::text,jsonb_build_object('name',v_name));
  ELSE
    SELECT name INTO v_name FROM public.pw_inventory_items WHERE id=p_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Insumo inexistente.'; END IF;
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
      EXECUTE 'DELETE FROM public.pw_supplier_inventory_items WHERE item_id=$1' USING p_id;
    END IF;
    DELETE FROM public.pw_inventory_items WHERE id=p_id;
    INSERT INTO public.pw_audit_events(user_id,module,action,entity_id,metadata)
      VALUES(v_actor,'inventory','item_deleted',p_id::text,jsonb_build_object('name',v_name));
  END IF;

  RETURN jsonb_build_object('id',p_id,'kind',v_kind,'deleted',true);
END;
$fn$;

REVOKE ALL ON FUNCTION public.pw_delete_operational_catalog_v1(text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pw_delete_operational_catalog_v1(text,uuid) TO authenticated;
-- Version 18 is superseded. Keep the definition for migration reproducibility,
-- but disable the old endpoint so the browser can only invoke permanent delete.
REVOKE ALL ON FUNCTION public.pw_retire_operational_catalog_v1(text,uuid) FROM PUBLIC, anon, authenticated;

COMMIT;
