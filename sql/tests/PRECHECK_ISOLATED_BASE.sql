-- Exige una copia de esquema previo 03-12, antes de ejecutar 14-17 en local.
\set ON_ERROR_STOP on
DO $pre$
DECLARE obj text;
BEGIN
 FOREACH obj IN ARRAY ARRAY['public.pw_branches','public.pw_members','public.pw_products','public.pw_suppliers','public.pw_inventory_items','public.pw_stock_locations','public.pw_purchase_documents','public.pw_purchase_lines','public.pw_inventory_transactions','public.pw_inventory_movements'] LOOP
  IF to_regclass(obj) IS NULL THEN RAISE EXCEPTION 'Esquema previo incompleto: %',obj; END IF;
 END LOOP;
 IF NOT EXISTS (SELECT 1 FROM public.pw_stock_locations WHERE id='central' AND active)
 OR NOT EXISTS (SELECT 1 FROM public.pw_stock_locations WHERE id='mora' AND active)
 OR NOT EXISTS (SELECT 1 FROM public.pw_stock_locations WHERE id='santacruz' AND active) THEN
  RAISE EXCEPTION 'Faltan almacén central o sucursales de prueba en la base local.';
 END IF;
 IF to_regprocedure('public.pw_post_inventory_movement_v1(jsonb)') IS NULL THEN
  RAISE EXCEPTION 'Falta la RPC de inventario de la migración 09.';
 END IF;
END;$pre$;
