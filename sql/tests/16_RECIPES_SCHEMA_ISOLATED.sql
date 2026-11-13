-- Lecturas de catálogo y restricciones; ejecutar solo en un clon aislado tras 16.
\set ON_ERROR_STOP on
BEGIN;
DO $checks$
DECLARE tab text;
BEGIN
 FOREACH tab IN ARRAY ARRAY['pw_inventory_item_costs','pw_recipe_versions','pw_recipe_lines','pw_sale_recipe_consumptions'] LOOP
   IF to_regclass('public.'||tab) IS NULL THEN RAISE EXCEPTION 'Falta tabla de recetas %',tab; END IF;
   IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=('public.'||tab)::regclass AND relrowsecurity) THEN RAISE EXCEPTION 'Falta RLS en %',tab; END IF;
   IF has_table_privilege('authenticated','public.'||tab,'INSERT') OR has_table_privilege('authenticated','public.'||tab,'UPDATE') OR has_table_privilege('authenticated','public.'||tab,'DELETE') THEN
    RAISE EXCEPTION 'Escritura directa indebida sobre %',tab;
   END IF;
 END LOOP;
 IF to_regclass('public.pw_recipe_versions_one_active_product_idx') IS NULL THEN RAISE EXCEPTION 'Falta unicidad de receta activa'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.pw_sale_recipe_consumptions'::regclass AND contype='f') THEN RAISE EXCEPTION 'Faltan relaciones de consumo'; END IF;
 -- Esta migración NO activa el consumo automático. Esa integración requiere
 -- una RPC venta+receta+inventario transaccional y su prueba por separado.
END;$checks$;
ROLLBACK;
