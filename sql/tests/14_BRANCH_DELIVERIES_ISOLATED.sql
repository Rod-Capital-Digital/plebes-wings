-- Run only against a disposable local database or Supabase branch after migration 14.
-- It creates temporary identities and inventory fixtures, then rolls everything back.
BEGIN;

INSERT INTO auth.users (id) VALUES
  ('76000000-0000-0000-0000-000000000001'),
  ('76000000-0000-0000-0000-000000000002');
INSERT INTO public.pw_members (user_id, display_name, role, branch_id, active) VALUES
  ('76000000-0000-0000-0000-000000000001','Delivery Owner','owner',NULL,true),
  ('76000000-0000-0000-0000-000000000002','Delivery Employee','employee','mora',true);
INSERT INTO public.pw_inventory_items (id,name,item_type,base_unit) VALUES
  ('76100000-0000-0000-0000-000000000001','Delivery test pollo','raw_material','kg'),
  ('76100000-0000-0000-0000-000000000002','Delivery test empaque','packaging','pieza');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','76000000-0000-0000-0000-000000000001',true);
DO $owner$
DECLARE v_delivery jsonb;v_repeat jsonb;v_reversal jsonb;v_request jsonb:=jsonb_build_object(
  'request_id','76200000-0000-4000-8000-000000000003','delivery_date',current_date::text,
  'destination_location_id','mora','responsible','Responsable de prueba','notes','escenario aislado',
  'lines',jsonb_build_array(jsonb_build_object('item_id','76100000-0000-0000-0000-000000000001','quantity',4.5),jsonb_build_object('item_id','76100000-0000-0000-0000-000000000002','quantity',10)));
BEGIN
 PERFORM public.pw_post_inventory_movement_v1(jsonb_build_object('request_id','76200000-0000-4000-8000-000000000001','location_id','central','item_id','76100000-0000-0000-0000-000000000001','quantity',5,'movement_type','opening','notes','conteo aislado'));
 PERFORM public.pw_post_inventory_movement_v1(jsonb_build_object('request_id','76200000-0000-4000-8000-000000000002','location_id','central','item_id','76100000-0000-0000-0000-000000000002','quantity',10,'movement_type','opening','notes','conteo aislado'));
 v_delivery:=public.pw_prepare_branch_delivery_v1(v_request);v_repeat:=public.pw_prepare_branch_delivery_v1(v_request);
 IF v_delivery->>'id' IS NULL OR (v_repeat->>'replayed')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'Delivery idempotency failed'; END IF;
 IF (SELECT quantity FROM public.pw_inventory_balances WHERE location_id='central' AND item_id='76100000-0000-0000-0000-000000000001')<>0.5
    OR (SELECT quantity FROM public.pw_inventory_balances WHERE location_id='mora' AND item_id='76100000-0000-0000-0000-000000000001')<>4.5 THEN RAISE EXCEPTION 'Delivery did not reconcile source and destination'; END IF;
 v_reversal:=public.pw_reverse_branch_delivery_v1(jsonb_build_object('request_id','76200000-0000-4000-8000-000000000007','original_transaction_id',v_delivery->>'id','reason','reversión aislada'));
 v_repeat:=public.pw_reverse_branch_delivery_v1(jsonb_build_object('request_id','76200000-0000-4000-8000-000000000007','original_transaction_id',v_delivery->>'id','reason','reversión aislada'));
 IF v_reversal->>'id' IS NULL OR (v_repeat->>'replayed')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'Delivery reversal idempotency failed'; END IF;
 IF (SELECT quantity FROM public.pw_inventory_balances WHERE location_id='central' AND item_id='76100000-0000-0000-0000-000000000001')<>5
    OR coalesce((SELECT quantity FROM public.pw_inventory_balances WHERE location_id='mora' AND item_id='76100000-0000-0000-0000-000000000001'),0)<>0 THEN RAISE EXCEPTION 'Delivery reversal did not reconcile balances'; END IF;
 BEGIN
  PERFORM public.pw_prepare_branch_delivery_v1(jsonb_set(v_request,'{request_id}','"76200000-0000-4000-8000-000000000004"'::jsonb,true)||jsonb_build_object('lines',jsonb_build_array(jsonb_build_object('item_id','76100000-0000-0000-0000-000000000001','quantity',5.001))));
  RAISE EXCEPTION 'Insufficient stock was accepted';
 EXCEPTION WHEN others THEN
  IF SQLERRM NOT LIKE '%Saldo insuficiente%' THEN RAISE; END IF;
 END;
 PERFORM public.pw_prepare_branch_delivery_v1(jsonb_build_object('request_id','76200000-0000-4000-8000-000000000008','delivery_date',current_date::text,'destination_location_id','mora','responsible','Responsable de prueba','lines',jsonb_build_array(jsonb_build_object('item_id','76100000-0000-0000-0000-000000000001','quantity',0.5))));
 PERFORM public.pw_post_inventory_movement_v1(jsonb_build_object('request_id','76200000-0000-4000-8000-000000000005','location_id','mora','item_id','76100000-0000-0000-0000-000000000001','quantity',-0.5,'movement_type','waste','notes','merma aislada'));
END;$owner$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','76000000-0000-0000-0000-000000000002',true);
DO $employee$
BEGIN
 IF EXISTS (SELECT 1 FROM public.pw_inventory_movements WHERE location_id='central') THEN RAISE EXCEPTION 'Employee can read central stock'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.pw_inventory_movements WHERE location_id='mora') THEN RAISE EXCEPTION 'Employee cannot read assigned branch stock'; END IF;
 BEGIN
  PERFORM public.pw_transfer_stock_v1(jsonb_build_object('request_id','76200000-0000-4000-8000-000000000006','from_location_id','mora','to_location_id','santacruz','item_id','76100000-0000-0000-0000-000000000001','quantity',1));
  RAISE EXCEPTION 'Employee unexpectedly transferred stock';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END;$employee$;
RESET ROLE;
ROLLBACK;
