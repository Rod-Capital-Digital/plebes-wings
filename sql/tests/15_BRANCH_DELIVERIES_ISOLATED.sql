-- PRUEBA DESTRUCTIVA Y REVERSIBLE: EXCLUSIVAMENTE CLON AISLADO / SUPABASE LOCAL.
-- Requiere esquema base 03-12 y migraciones 14 y 15 en la misma base aislada.
-- Necesita ejecutarse con rol administrador de la base local (puede insertar auth.users).
\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users(id) VALUES
 ('78000000-0000-4000-8000-000000000001'),
 ('78000000-0000-4000-8000-000000000002'),
 ('78000000-0000-4000-8000-000000000003');
INSERT INTO public.pw_members(user_id,display_name,role,branch_id,active) VALUES
 ('78000000-0000-4000-8000-000000000001','Test owner 15','owner',NULL,true),
 ('78000000-0000-4000-8000-000000000002','Test mora 15','employee','mora',true),
 ('78000000-0000-4000-8000-000000000003','Test santacruz 15','employee','santacruz',true);
INSERT INTO public.pw_inventory_items(id,name,item_type,base_unit) VALUES
 ('78100000-0000-4000-8000-000000000001','Test pollo entrega 15','raw_material','kg');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','78000000-0000-4000-8000-000000000001',true);
DO $owner$
DECLARE draft jsonb; dispatched jsonb; replay jsonb; v_line uuid; ins uuid := '78100000-0000-4000-8000-000000000001';
BEGIN
 PERFORM public.pw_post_inventory_movement_v1(jsonb_build_object('request_id','78200000-0000-4000-8000-000000000001','location_id','central','item_id',ins,'quantity',10,'movement_type','opening','notes','fixture'));
 draft := public.pw_create_branch_delivery_v1(jsonb_build_object('request_id','78200000-0000-4000-8000-000000000002','destination_location_id','mora','delivery_date',current_date::text,'responsible','Bodega','lines',jsonb_build_array(jsonb_build_object('item_id',ins,'quantity',6))));
 IF draft->>'status'<>'draft' THEN RAISE EXCEPTION 'La entrega no inició como draft'; END IF;
 PERFORM set_config('pw_test.delivery_id',draft->>'id',true);
 SELECT id INTO v_line FROM public.pw_branch_delivery_lines WHERE delivery_id=(draft->>'id')::uuid;
 PERFORM set_config('pw_test.line_id',v_line::text,true);
 IF coalesce((SELECT sum(quantity) FROM public.pw_inventory_movements WHERE item_id=ins AND location_id='central'),0)<>10 THEN RAISE EXCEPTION 'El borrador modificó saldo'; END IF;
 dispatched := public.pw_dispatch_branch_delivery_v1((draft->>'id')::uuid,jsonb_build_object('request_id','78200000-0000-4000-8000-000000000003','responsible','Chofer'));
 replay := public.pw_dispatch_branch_delivery_v1((draft->>'id')::uuid,jsonb_build_object('request_id','78200000-0000-4000-8000-000000000003','responsible','Chofer'));
 IF (replay->>'replayed')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'Despacho duplicado'; END IF;
 IF coalesce((SELECT sum(quantity) FROM public.pw_inventory_movements WHERE item_id=ins AND location_id='central'),0)<>4 OR coalesce((SELECT sum(quantity) FROM public.pw_inventory_movements WHERE item_id=ins AND location_id='in_transit'),0)<>6 THEN RAISE EXCEPTION 'Despacho no concilia'; END IF;
 -- El traspaso antiguo no puede utilizar tránsito como origen y el trigger no deja pasar la operación.
 BEGIN
  PERFORM public.pw_transfer_stock_v1(jsonb_build_object('request_id','78200000-0000-4000-8000-000000000004','from_location_id','in_transit','to_location_id','mora','item_id',ins,'quantity',1));
  RAISE EXCEPTION 'Antiguo traspaso manipuló tránsito';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 -- La API antigua de entregas directas de 14 ya no debe tener EXECUTE autenticado.
 IF has_function_privilege('authenticated','public.pw_prepare_branch_delivery_v1(jsonb)','EXECUTE') THEN RAISE EXCEPTION 'Entrega directa antigua sigue habilitada'; END IF;
END;$owner$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','78000000-0000-4000-8000-000000000003',true);
DO $wrong_branch$
DECLARE did uuid:=current_setting('pw_test.delivery_id')::uuid; lid uuid:=current_setting('pw_test.line_id')::uuid;
BEGIN
 IF EXISTS(SELECT 1 FROM public.pw_branch_deliveries WHERE id=did) THEN RAISE EXCEPTION 'RLS mostró otra sucursal'; END IF;
 -- La visibilidad de la RLS ya impide la consulta; una RPC SECURITY DEFINER debe negar igual.
 BEGIN
  PERFORM public.pw_receive_branch_delivery_v1(did,jsonb_build_object('request_id','78200000-0000-4000-8000-000000000005','responsible','Otra sucursal','lines',jsonb_build_array(jsonb_build_object('delivery_line_id',lid,'quantity',1))));
  RAISE EXCEPTION 'Sucursal equivocada pudo recibir';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END;$wrong_branch$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','78000000-0000-4000-8000-000000000002',true);
DO $employee$
DECLARE did uuid:=current_setting('pw_test.delivery_id')::uuid; lid uuid:=current_setting('pw_test.line_id')::uuid; rec jsonb; repeated jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.pw_branch_deliveries WHERE id=did) THEN RAISE EXCEPTION 'Empleado mora no puede ver entrega a su sucursal'; END IF;
 rec := public.pw_receive_branch_delivery_v1(did,jsonb_build_object('request_id','78200000-0000-4000-8000-000000000006','responsible','Empleado Mora','lines',jsonb_build_array(jsonb_build_object('delivery_line_id',lid,'quantity',2))));
 IF rec->>'status'<>'received_with_differences' OR (rec->>'pending_in_transit')::numeric<>4 THEN RAISE EXCEPTION 'Parcial no reconcilia'; END IF;
 repeated := public.pw_receive_branch_delivery_v1(did,jsonb_build_object('request_id','78200000-0000-4000-8000-000000000006','responsible','Empleado Mora','lines',jsonb_build_array(jsonb_build_object('delivery_line_id',lid,'quantity',2))));
 IF (repeated->>'replayed')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'Recepción no idempotente'; END IF;
 BEGIN
  PERFORM public.pw_receive_branch_delivery_v1(did,jsonb_build_object('request_id','78200000-0000-4000-8000-000000000007','responsible','Empleado Mora','lines',jsonb_build_array(jsonb_build_object('delivery_line_id',lid,'quantity',5))));
  RAISE EXCEPTION 'Aceptó recepción superior a lo enviado';
 EXCEPTION WHEN others THEN
  IF SQLERRM='Aceptó recepción superior a lo enviado' THEN RAISE; END IF;
 END;
 rec := public.pw_receive_branch_delivery_v1(did,jsonb_build_object('request_id','78200000-0000-4000-8000-000000000008','responsible','Empleado Mora','lines',jsonb_build_array(jsonb_build_object('delivery_line_id',lid,'quantity',4))));
 IF rec->>'status'<>'received' THEN RAISE EXCEPTION 'No se concluyó entrega'; END IF;
END;$employee$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','78000000-0000-4000-8000-000000000001',true);
DO $balances$
DECLARE ins uuid := '78100000-0000-4000-8000-000000000001';
BEGIN
 IF coalesce((SELECT sum(quantity) FROM public.pw_inventory_movements WHERE item_id=ins AND location_id='central'),0)<>4
 OR coalesce((SELECT sum(quantity) FROM public.pw_inventory_movements WHERE item_id=ins AND location_id='in_transit'),0)<>0
 OR coalesce((SELECT sum(quantity) FROM public.pw_inventory_movements WHERE item_id=ins AND location_id='mora'),0)<>6 THEN
   RAISE EXCEPTION 'La entrega total no reconcilia 4/0/6';
 END IF;
END;$balances$;
RESET ROLE;
ROLLBACK;
