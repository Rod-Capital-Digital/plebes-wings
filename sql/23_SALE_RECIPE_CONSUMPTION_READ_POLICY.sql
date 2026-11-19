-- Read-only audit visibility for recipe consumption headers; writes remain RPC-only.
BEGIN;
GRANT SELECT ON public.pw_sale_recipe_consumptions TO authenticated;
DROP POLICY IF EXISTS pw_sale_recipe_consumptions_manager_read ON public.pw_sale_recipe_consumptions;
CREATE POLICY pw_sale_recipe_consumptions_manager_read
ON public.pw_sale_recipe_consumptions
FOR SELECT TO authenticated
USING ((SELECT private.pw_is_manager()));
COMMIT;
