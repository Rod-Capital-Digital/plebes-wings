-- AUDITED CANDIDATE / NOT DEPLOYED / MUST BE TESTED IN STAGING.
-- PRECONDITION BEFORE DEPLOYMENT: verify every active client calls
-- public.pw_register_sale_v3, not v1/v2. This migration intentionally revokes
-- authenticated callers from legacy sale RPCs to prevent bypassing inventory.
-- Plebes Wings 25: finished-goods inventory control by individual serving.
-- Prerequisites: 07, 09, 15, 16, 17, 22 and 24.
-- Catalog operations are additive and idempotent. Sale RPC permissions are
-- intentionally hardened. No balances, sales, purchases, deliveries, prices
-- or Boneless active recipes are changed.
BEGIN;

-- A discrete unit represents a sellable/transferable whole. Numeric precision is
-- still retained for mass and volume articles, including the existing Boneless flow.
CREATE OR REPLACE FUNCTION private.pw_assert_discrete_inventory_quantity(p_item_id uuid,p_quantity numeric,p_context text)
RETURNS void LANGUAGE plpgsql STABLE SET search_path='' AS $fn$
DECLARE v_unit text;
BEGIN
  SELECT lower(btrim(base_unit)) INTO v_unit FROM public.pw_inventory_items WHERE id=p_item_id;
  IF v_unit IN ('porción','pieza','unidad','vaso','jarra') AND p_quantity<>trunc(p_quantity) THEN
    RAISE EXCEPTION '% exige una cantidad entera para la unidad %.',p_context,v_unit USING ERRCODE='23514';
  END IF;
END;$fn$;
REVOKE ALL ON FUNCTION private.pw_assert_discrete_inventory_quantity(uuid,numeric,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.pw_inventory_movement_discrete_quantity()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $fn$
BEGIN
  PERFORM private.pw_assert_discrete_inventory_quantity(NEW.item_id,NEW.quantity,'El movimiento de inventario');
  RETURN NEW;
END;$fn$;
DROP TRIGGER IF EXISTS pw_inventory_movement_discrete_quantity ON public.pw_inventory_movements;
CREATE TRIGGER pw_inventory_movement_discrete_quantity
BEFORE INSERT OR UPDATE OF item_id,quantity ON public.pw_inventory_movements
FOR EACH ROW EXECUTE FUNCTION private.pw_inventory_movement_discrete_quantity();

CREATE OR REPLACE FUNCTION private.pw_purchase_line_discrete_quantity()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $fn$
BEGIN
  PERFORM private.pw_assert_discrete_inventory_quantity(NEW.item_id,NEW.quantity,'La partida de compra');
  RETURN NEW;
END;$fn$;
DROP TRIGGER IF EXISTS pw_purchase_line_discrete_quantity ON public.pw_purchase_lines;
CREATE TRIGGER pw_purchase_line_discrete_quantity
BEFORE INSERT OR UPDATE OF item_id,quantity ON public.pw_purchase_lines
FOR EACH ROW EXECUTE FUNCTION private.pw_purchase_line_discrete_quantity();

CREATE OR REPLACE FUNCTION private.pw_purchase_receipt_discrete_quantity()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $fn$
DECLARE v_item uuid;
BEGIN
  SELECT item_id INTO v_item FROM public.pw_purchase_lines WHERE id=NEW.purchase_line_id;
  PERFORM private.pw_assert_discrete_inventory_quantity(v_item,NEW.received_quantity,'La recepción de compra');
  RETURN NEW;
END;$fn$;
DROP TRIGGER IF EXISTS pw_purchase_receipt_discrete_quantity ON public.pw_purchase_receipt_lines;
CREATE TRIGGER pw_purchase_receipt_discrete_quantity
BEFORE INSERT OR UPDATE OF purchase_line_id,received_quantity ON public.pw_purchase_receipt_lines
FOR EACH ROW EXECUTE FUNCTION private.pw_purchase_receipt_discrete_quantity();

CREATE OR REPLACE FUNCTION private.pw_delivery_line_discrete_quantity()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $fn$
BEGIN
  PERFORM private.pw_assert_discrete_inventory_quantity(NEW.item_id,NEW.planned_quantity,'La partida de entrega');
  RETURN NEW;
END;$fn$;
DROP TRIGGER IF EXISTS pw_delivery_line_discrete_quantity ON public.pw_branch_delivery_lines;
CREATE TRIGGER pw_delivery_line_discrete_quantity
BEFORE INSERT OR UPDATE OF item_id,planned_quantity ON public.pw_branch_delivery_lines
FOR EACH ROW EXECUTE FUNCTION private.pw_delivery_line_discrete_quantity();

CREATE OR REPLACE FUNCTION private.pw_delivery_receipt_discrete_quantity()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $fn$
DECLARE v_item uuid;
BEGIN
  SELECT item_id INTO v_item FROM public.pw_branch_delivery_lines WHERE id=NEW.delivery_line_id;
  PERFORM private.pw_assert_discrete_inventory_quantity(v_item,NEW.received_quantity,'La recepción de entrega');
  RETURN NEW;
END;$fn$;
DROP TRIGGER IF EXISTS pw_delivery_receipt_discrete_quantity ON public.pw_branch_delivery_receipt_lines;
CREATE TRIGGER pw_delivery_receipt_discrete_quantity
BEFORE INSERT OR UPDATE OF delivery_line_id,received_quantity ON public.pw_branch_delivery_receipt_lines
FOR EACH ROW EXECUTE FUNCTION private.pw_delivery_receipt_discrete_quantity();

-- The two Alitas articles are matched by their existing SKU. No quantities are
-- posted. The ready portion remains the sales-consumed article from its draft.
UPDATE public.pw_inventory_items i
SET item_type='finished_good',product_id='ali',base_unit='porción',active=true,
    notes=coalesce(i.notes,'Porción preparada de Alitas; una venta consume una porción.')
WHERE lower(btrim(i.sku))='pw-ali-ready-portion'
  AND i.product_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.pw_inventory_items x WHERE x.product_id='ali' AND x.id<>i.id);

-- Insert only a catalog row, never opening stock. Refresco is a purchased
-- finished good: it goes from a purchase receipt directly to distribution.
WITH catalog(product_id,sku,name,base_unit,item_type,notes) AS (
  VALUES
   ('pw_burger_sirloin_200','PW-BUR-SIRLOIN-200-FINISHED','Hamburguesa Sirloin terminada','pieza','finished_good','Producto terminado; una venta consume una pieza.'),
   ('pw_burger_arrachera_200','PW-BUR-ARRACHERA-200-FINISHED','Hamburguesa Arrachera terminada','pieza','finished_good','Producto terminado; una venta consume una pieza.'),
   ('pw_burger_pollo_sencilla_120','PW-BUR-POLLO-SENCILLA-120-FINISHED','Hamburguesa de pollo sencilla terminada','pieza','finished_good','Producto terminado; una venta consume una pieza.'),
   ('pw_burger_pollo_doble_200','PW-BUR-POLLO-DOBLE-200-FINISHED','Hamburguesa de pollo doble terminada','pieza','finished_good','Producto terminado; una venta consume una pieza.'),
   ('pw_burger_pollo_pepperoni_200','PW-BUR-POLLO-PEPPERONI-200-FINISHED','Hamburguesa de pollo Pepperoni terminada','pieza','finished_good','Producto terminado; una venta consume una pieza.'),
   ('pw_burger_pollo_hawaiana_200','PW-BUR-POLLO-HAWAIANA-200-FINISHED','Hamburguesa de pollo Hawaiana terminada','pieza','finished_good','Producto terminado; una venta consume una pieza.'),
   ('pw_hotdog_sencillo','PW-HOTDOG-SENCILLO-FINISHED','Hot dog sencillo terminado','pieza','finished_good','Producto terminado; una venta consume una pieza.'),
   ('pw_hotdog_especial_120','PW-HOTDOG-ESPECIAL-120-FINISHED','Hot dog especial terminado','pieza','finished_good','Producto terminado; una venta consume una pieza.'),
   ('pw_nachos_200','PW-NACHOS-200-FINISHED','Nachos terminados','porción','finished_good','Producto terminado; una venta consume una porción.'),
   ('pw_papas_chicas_125','PW-PAPAS-CHICAS-125-FINISHED','Papas chicas terminadas','porción','finished_good','Producto terminado; una venta consume una porción.'),
   ('pw_papas_medianas_200','PW-PAPAS-MEDIANAS-200-FINISHED','Papas medianas terminadas','porción','finished_good','Producto terminado; una venta consume una porción.'),
   ('pw_papas_grandes_300','PW-PAPAS-GRANDES-300-FINISHED','Papas grandes terminadas','porción','finished_good','Producto terminado; una venta consume una porción.'),
   ('pw_refresco','PW-REFRESCO-UNIT','Refresco terminado','unidad','finished_good','Producto envasado comprado terminado; no requiere producción.'),
   ('pw_bebida_sabor_500','PW-BEBIDA-SABOR-500-FINISHED','Bebida de sabor 500 ml terminada','vaso','finished_good','Producto terminado; una venta consume un vaso.'),
   ('pw_bebida_sabor_1000','PW-BEBIDA-SABOR-1000-FINISHED','Bebida de sabor 1 L terminada','vaso','finished_good','Producto terminado; una venta consume un vaso.'),
   ('pw_jarra_agua_refill','PW-JARRA-AGUA-REFILL-FINISHED','Jarra de agua refill terminada','jarra','finished_good','Producto terminado; una venta consume una jarra.')
)
INSERT INTO public.pw_inventory_items(sku,name,item_type,base_unit,product_id,notes,active)
SELECT c.sku,c.name,c.item_type,c.base_unit,c.product_id,c.notes,true
FROM catalog c JOIN public.pw_products p ON p.id=c.product_id AND p.active
WHERE NOT EXISTS (SELECT 1 FROM public.pw_inventory_items i WHERE i.product_id=c.product_id)
  AND NOT EXISTS (SELECT 1 FROM public.pw_inventory_items i WHERE lower(btrim(i.sku))=lower(c.sku));

-- Optional preparation inputs are catalog definitions only. They give central
-- production a real source article to consume when the operation is ready; no
-- opening movement is inserted and Refresco is intentionally excluded.
WITH inputs(sku,name,base_unit,notes) AS (
 VALUES
  ('PW-BUR-SIRLOIN-200-INPUT-PORTION','Porción de entrada Hamburguesa Sirloin','pieza','Porción de entrada para producir hamburguesa terminada.'),
  ('PW-BUR-ARRACHERA-200-INPUT-PORTION','Porción de entrada Hamburguesa Arrachera','pieza','Porción de entrada para producir hamburguesa terminada.'),
  ('PW-BUR-POLLO-SENCILLA-120-INPUT-PORTION','Porción de entrada Hamburguesa de pollo sencilla','pieza','Porción de entrada para producir hamburguesa terminada.'),
  ('PW-BUR-POLLO-DOBLE-200-INPUT-PORTION','Porción de entrada Hamburguesa de pollo doble','pieza','Porción de entrada para producir hamburguesa terminada.'),
  ('PW-BUR-POLLO-PEPPERONI-200-INPUT-PORTION','Porción de entrada Hamburguesa de pollo Pepperoni','pieza','Porción de entrada para producir hamburguesa terminada.'),
  ('PW-BUR-POLLO-HAWAIANA-200-INPUT-PORTION','Porción de entrada Hamburguesa de pollo Hawaiana','pieza','Porción de entrada para producir hamburguesa terminada.'),
  ('PW-HOTDOG-SENCILLO-INPUT-PORTION','Porción de entrada Hot dog sencillo','pieza','Porción de entrada para producir hot dog terminado.'),
  ('PW-HOTDOG-ESPECIAL-120-INPUT-PORTION','Porción de entrada Hot dog especial','pieza','Porción de entrada para producir hot dog terminado.'),
  ('PW-NACHOS-200-INPUT-PORTION','Porción de entrada Nachos','porción','Porción de entrada para producir nachos terminados.'),
  ('PW-PAPAS-CHICAS-125-INPUT-PORTION','Porción de entrada Papas chicas','porción','Porción de entrada para producir papas terminadas.'),
  ('PW-PAPAS-MEDIANAS-200-INPUT-PORTION','Porción de entrada Papas medianas','porción','Porción de entrada para producir papas terminadas.'),
  ('PW-PAPAS-GRANDES-300-INPUT-PORTION','Porción de entrada Papas grandes','porción','Porción de entrada para producir papas terminadas.'),
  ('PW-BEBIDA-SABOR-500-INPUT-PORTION','Porción de entrada Bebida de sabor 500 ml','vaso','Porción de entrada para producir bebida terminada.'),
  ('PW-BEBIDA-SABOR-1000-INPUT-PORTION','Porción de entrada Bebida de sabor 1 L','vaso','Porción de entrada para producir bebida terminada.'),
  ('PW-JARRA-AGUA-REFILL-INPUT-PORTION','Porción de entrada Jarra de agua refill','jarra','Porción de entrada para producir jarra terminada.')
)
INSERT INTO public.pw_inventory_items(sku,name,item_type,base_unit,notes,active)
SELECT sku,name,'semi_finished',base_unit,notes,true FROM inputs
WHERE NOT EXISTS (SELECT 1 FROM public.pw_inventory_items i WHERE lower(btrim(i.sku))=lower(inputs.sku));

-- Seed a draft recipe only where there is no current recipe of any state. This
-- preserves Alitas' existing draft and every historic/active recipe unchanged.
DO $seed$
DECLARE r record;v_item uuid;v_recipe uuid;v_actor uuid;v_version integer;
BEGIN
  SELECT user_id INTO v_actor FROM public.pw_members
   WHERE active AND role IN ('owner','consultant') ORDER BY user_id LIMIT 1;
  IF v_actor IS NULL THEN
    RAISE NOTICE 'No active manager found: finished-good catalog was seeded; draft recipes were skipped.';
    RETURN;
  END IF;
  FOR r IN
    SELECT p.id,p.name,i.id AS item_id,i.base_unit
    FROM public.pw_products p
    JOIN public.pw_inventory_items i ON i.product_id=p.id AND i.active AND i.item_type='finished_good'
    WHERE p.active AND p.id<>'bon'
      AND NOT EXISTS (SELECT 1 FROM public.pw_recipe_versions rv WHERE rv.product_id=p.id)
    ORDER BY p.id
  LOOP
    SELECT coalesce(max(version_no),0)+1 INTO v_version FROM public.pw_recipe_versions WHERE product_id=r.id;
    INSERT INTO public.pw_recipe_versions(product_id,name,version_no,yield_units,waste_percent,status,created_by)
    VALUES(r.id,r.name||' · una '||r.base_unit||' terminada',v_version,1,0,'draft',v_actor)
    RETURNING id INTO v_recipe;
    INSERT INTO public.pw_recipe_lines(recipe_version_id,item_id,quantity,unit)
    VALUES(v_recipe,r.item_id,1,r.base_unit);
  END LOOP;
END $seed$;

-- The active Boneless recipe remains intact. On an active finished-good recipe,
-- a shortage now reaches the employee as an explicit rejected sale message.
CREATE OR REPLACE FUNCTION public.pw_register_sale_v3(p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_result jsonb;v_sale_id uuid;v_branch_id text;v_request_id uuid;
BEGIN
 v_result:=public.pw_register_sale_v2(p_request);
  -- Idempotent replay: NEVER consume recipes for a sale already posted.
  -- Otherwise activating a recipe later can retroactively consume stock when
  -- an old request_id is retried.
  IF coalesce((v_result->>'replayed')::boolean,false) THEN
    RETURN v_result;
  END IF;
  v_sale_id:=(v_result->>'id')::uuid;v_branch_id:=v_result->>'branch_id';v_request_id:=(p_request->>'request_id')::uuid;
 BEGIN
   PERFORM private.pw_post_sale_recipe_inventory_v1(v_sale_id,v_branch_id,v_request_id,auth.uid());
 EXCEPTION WHEN check_violation THEN
   IF SQLERRM LIKE 'Existencia insuficiente%' THEN
     RAISE EXCEPTION 'Venta rechazada por falta de inventario en tu sucursal. No se generó el ticket; solicita reposición y vuelve a intentarlo.' USING ERRCODE='23514';
   END IF;
   RAISE;
 END;
 RETURN v_result;
END;$fn$;
REVOKE ALL ON FUNCTION public.pw_register_sale_v3(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pw_register_sale_v3(jsonb) TO authenticated;

-- SECURITY GATE: signed-in clients must use v3, the only public sale RPC that
-- applies inventory recipes. v1/v2 previously accepted writes without consuming
-- inventory. Run this only after verifying all app versions use v3.
REVOKE ALL ON FUNCTION public.pw_register_sale_v1(jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.pw_register_sale_v2(jsonb) FROM PUBLIC,anon,authenticated;

-- Fail closed rather than silently skipping recipe/catalog setup on SKU or
-- product_id collisions. A valid result needs exactly one mapped finished
-- article and at least one draft/active one-to-one sale recipe per product.
DO $assert_finished_good_catalog$
DECLARE v_unconfigured jsonb;
BEGIN
 SELECT jsonb_agg(jsonb_build_object('product_id',p.id,'product',p.name))
 INTO v_unconfigured
 FROM public.pw_products p
 WHERE p.active AND p.id <> 'bon' AND (
   (SELECT count(*) FROM public.pw_inventory_items i
      WHERE i.product_id=p.id AND i.active AND i.item_type='finished_good') <> 1
   OR NOT EXISTS (
     SELECT 1 FROM public.pw_recipe_versions rv
     JOIN public.pw_recipe_lines rl ON rl.recipe_version_id=rv.id
     JOIN public.pw_inventory_items ii ON ii.id=rl.item_id
     WHERE rv.product_id=p.id AND rv.status IN ('draft','active')
       AND rv.yield_units=1 AND rv.waste_percent=0
       AND (SELECT count(*) FROM public.pw_recipe_lines only_line
            WHERE only_line.recipe_version_id=rv.id)=1
       AND rl.quantity=1 AND rl.unit=ii.base_unit
       AND ii.product_id=p.id AND ii.active AND ii.item_type='finished_good'
   )
 );
 IF v_unconfigured IS NOT NULL THEN
   RAISE EXCEPTION 'Productos sin configuración segura de porción terminada: %',v_unconfigured;
 END IF;
END $assert_finished_good_catalog$;

COMMIT;
