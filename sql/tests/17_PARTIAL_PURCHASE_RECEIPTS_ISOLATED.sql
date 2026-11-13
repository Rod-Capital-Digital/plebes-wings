-- EXCLUSIVAMENTE SUPABASE LOCAL / CLON AISLADO. No ejecutar en producción.
-- Requiere base 03-12 y migraciones 14,15,16,17 aplicadas al clon.
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id) VALUES
 ('79000000-0000-4000-8000-000000000001'),
 ('79000000-0000-4000-8000-000000000002');
INSERT INTO public.pw_members(user_id,display_name,role,branch_id,active) VALUES
 ('79000000-0000-4000-8000-000000000001','Test owner 17','owner',NULL,true),
 ('79000000-0000-4000-8000-000000000002','Test Santa Cruz 17','employee','santacruz',true);
INSERT INTO public.pw_suppliers(id,name) VALUES ('79100000-0000-4000-8000-000000000001','Proveedor aislado migración 17');
INSERT INTO public.pw_inventory_items(id,name,item_type,base_unit) VALUES ('79100000-0000-4000-8000-000000000002','Materia prima aislada 17','raw_material','kg');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','79000000-0000-4000-8000-000000000001',true);
DO $owner$
DECLARE p uuid; second_p uuid; lineid uuid; qty numeric; a jsonb; b jsonb; old jsonb; ins uuid:='79100000-0000-4000-8000-000000000002'; sup uuid:='79100000-0000-4000-8000-000000000001';
BEGIN
 a:=public.pw_create_purchase_draft_v1(jsonb_build_object('request_id','79200000-0000-4000-8000-000000000001','supplier_id',sup,'purchase_date',(now() AT TIME ZONE 'America/Mexico_City')::date::text,'payment_method','efectivo','destination_location_id','mora','lines',jsonb_build_array(jsonb_build_object('item_id',ins,'quantity',10,'unit','kg','unit_cost',25))));
 p:=(a->>'id')::uuid;
 PERFORM set_config('pw_test.purchase_id',p::text,true);
 PERFORM public.pw_confirm_purchase_v1(p,'79200000-0000-4000-8000-000000000002');
 SELECT id INTO lineid FROM public.pw_purchase_lines WHERE purchase_id=p;
 PERFORM set_config('pw_test.purchase_line_id',lineid::text,true);
 a:=public.pw_receive_purchase_partial_v1(p,jsonb_build_object('request_id','79200000-0000-4000-8000-000000000003','notes','primera recepción','lines',jsonb_build_array(jsonb_build_object('purchase_line_id',lineid,'quantity',4))));
 IF a->>'status'<>'partially_received' THEN RAISE EXCEPTION 'No se marcó compra parcial'; END IF;
 b:=public.pw_receive_purchase_partial_v1(p,jsonb_build_object('request_id','79200000-0000-4000-8000-000000000003','notes','primera recepción','lines',jsonb_build_array(jsonb_build_object('purchase_line_id',lineid,'quantity',4))));
 IF (b->>'replayed')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'Reintento de recepción parcial duplicó'; END IF;
 SELECT coalesce(sum(quantity),0) INTO qty FROM public.pw_inventory_movements WHERE item_id=ins AND location_id='mora';
 IF qty<>4 THEN RAISE EXCEPTION 'Contabilización parcial incorrecta: %',qty; END IF;
 b:=public.pw_receive_purchase_partial_v1(p,jsonb_build_object('request_id','79200000-0000-4000-8000-000000000004','notes','segunda recepción','lines',jsonb_build_array(jsonb_build_object('purchase_line_id',lineid,'quantity',6))));
 IF b->>'status'<>'received' THEN RAISE EXCEPTION 'Recepción final no cerró documento'; END IF;
 old:=public.pw_receive_purchase_partial_v1(p,jsonb_build_object('request_id','79200000-0000-4000-8000-000000000003','notes','primera recepción','lines',jsonb_build_array(jsonb_build_object('purchase_line_id',lineid,'quantity',4))));
 IF (old->>'replayed')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'Reintento de primera recepción luego de completar la compra'; END IF;
 SELECT coalesce(sum(quantity),0) INTO qty FROM public.pw_inventory_movements WHERE item_id=ins AND location_id='mora';
 IF qty<>10 THEN RAISE EXCEPTION 'Inventario parcial/final duplicado: %',qty; END IF;
 IF (SELECT count(*) FROM public.pw_purchase_receipts WHERE purchase_id=p)<>2 THEN RAISE EXCEPTION 'Número de recibos parciales incorrecto'; END IF;
 BEGIN
  PERFORM public.pw_receive_purchase_partial_v1(p,jsonb_build_object('request_id','79200000-0000-4000-8000-000000000005','lines',jsonb_build_array(jsonb_build_object('purchase_line_id',lineid,'quantity',1))));
  RAISE EXCEPTION 'Se aceptó recepción después de completarse la compra';
 EXCEPTION WHEN others THEN
  IF SQLERRM='Se aceptó recepción después de completarse la compra' THEN RAISE; END IF;
 END;
 -- Compatibilidad con el endpoint de recepción completa preexistente.
 a:=public.pw_create_purchase_draft_v1(jsonb_build_object('request_id','79200000-0000-4000-8000-000000000006','supplier_id',sup,'purchase_date',(now() AT TIME ZONE 'America/Mexico_City')::date::text,'payment_method','transferencia','destination_location_id','mora','lines',jsonb_build_array(jsonb_build_object('item_id',ins,'quantity',3,'unit','kg','unit_cost',25))));
 second_p:=(a->>'id')::uuid;
 PERFORM public.pw_confirm_purchase_v1(second_p,'79200000-0000-4000-8000-000000000007');
 b:=public.pw_receive_purchase_v1(second_p,'79200000-0000-4000-8000-000000000008');
 IF b->>'status'<>'received' THEN RAISE EXCEPTION 'Compatibilidad endpoint completo rota'; END IF;
 SELECT coalesce(sum(quantity),0) INTO qty FROM public.pw_inventory_movements WHERE item_id=ins AND location_id='mora';
 IF qty<>13 THEN RAISE EXCEPTION 'El trigger antiguo duplicó entradas: %',qty; END IF;
 IF EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.pw_purchase_documents'::regclass AND tgname='pw_purchase_received_inventory' AND NOT tgisinternal) THEN RAISE EXCEPTION 'Trigger antiguo sigue activo'; END IF;
END;$owner$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','79000000-0000-4000-8000-000000000002',true);
DO $employee$
DECLARE p uuid:=current_setting('pw_test.purchase_id')::uuid; lid uuid:=current_setting('pw_test.purchase_line_id')::uuid;
BEGIN
 IF EXISTS(SELECT 1 FROM public.pw_purchase_documents WHERE id=p) THEN RAISE EXCEPTION 'RLS expuso compra Mora a Santa Cruz'; END IF;
 BEGIN
  PERFORM public.pw_receive_purchase_partial_v1(p,jsonb_build_object('request_id','79200000-0000-4000-8000-000000000009','lines',jsonb_build_array(jsonb_build_object('purchase_line_id',lid,'quantity',1))));
  RAISE EXCEPTION 'Empleado de otra sucursal recibió compra';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END;$employee$;
RESET ROLE;
ROLLBACK;
