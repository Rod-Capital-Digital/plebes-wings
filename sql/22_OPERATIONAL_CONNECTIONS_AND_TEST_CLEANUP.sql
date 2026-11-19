-- Plebes Wings 22: connect sales to recipe inventory, enable assigned employees
-- to operate their own cash drawer, and allow only reversible test data to be removed.
BEGIN;

-- A cash operator is either management or an employee assigned to the same branch.
CREATE OR REPLACE FUNCTION private.pw_can_operate_cash_branch(p_branch_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.pw_members m
    WHERE m.user_id = auth.uid()
      AND m.active
      AND (m.role IN ('owner','consultant') OR (m.role='employee' AND m.branch_id=p_branch_id))
  );
$fn$;
REVOKE ALL ON FUNCTION private.pw_can_operate_cash_branch(text) FROM PUBLIC, anon, authenticated;

-- Employee cash operations stay strictly scoped to their assigned branch.
CREATE OR REPLACE FUNCTION public.pw_open_cash_session_v1(p_branch_id text,p_business_date date,p_float numeric,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor uuid:=auth.uid();v_id uuid;v_record public.pw_cash_sessions%ROWTYPE;
BEGIN
 IF v_actor IS NULL OR NOT private.pw_can_operate_cash_branch(p_branch_id) THEN RAISE EXCEPTION 'No tienes autorización para abrir la caja de esta sucursal.' USING ERRCODE='42501'; END IF;
 IF p_request_id IS NULL OR p_float IS NULL OR p_float<0 OR p_float<>round(p_float,2) OR p_business_date IS NULL OR p_branch_id IS NULL THEN RAISE EXCEPTION 'Datos inválidos.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.pw_branches WHERE id=p_branch_id AND active) THEN RAISE EXCEPTION 'Sucursal no válida.'; END IF;
 SELECT * INTO v_record FROM public.pw_cash_sessions WHERE request_id=p_request_id;
 IF FOUND THEN
  IF v_record.branch_id<>p_branch_id OR v_record.business_date<>p_business_date OR v_record.opening_float<>p_float THEN RAISE EXCEPTION 'Solicitud duplicada diferente.'; END IF;
  IF NOT private.pw_can_operate_cash_branch(v_record.branch_id) THEN RAISE EXCEPTION 'Sucursal no autorizada.' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object('id',v_record.id,'status',v_record.status,'replayed',true);
 END IF;
 INSERT INTO public.pw_cash_sessions(branch_id,business_date,opening_float,opened_by,request_id)
 VALUES(p_branch_id,p_business_date,p_float,v_actor,p_request_id) RETURNING id INTO v_id;
 INSERT INTO public.pw_audit_events(user_id,module,action,entity_id,metadata) VALUES(v_actor,'cash','opened',v_id::text,jsonb_build_object('branch',p_branch_id,'business_date',p_business_date));
 RETURN jsonb_build_object('id',v_id,'status','open','replayed',false);
END;$fn$;

CREATE OR REPLACE FUNCTION public.pw_close_cash_session_v1(p_session_id uuid,p_counted numeric,p_withdrawals numeric,p_note text,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor uuid:=auth.uid();v_session public.pw_cash_sessions%ROWTYPE;v_summary jsonb;v_expected numeric;
BEGIN
 IF v_actor IS NULL THEN RAISE EXCEPTION 'Autenticación requerida.' USING ERRCODE='42501'; END IF;
 IF p_request_id IS NULL OR p_counted IS NULL OR p_counted<0 OR p_counted<>round(p_counted,2) OR p_withdrawals IS NULL OR p_withdrawals<0 OR p_withdrawals<>round(p_withdrawals,2) THEN RAISE EXCEPTION 'Conteo inválido.'; END IF;
 SELECT * INTO v_session FROM public.pw_cash_sessions WHERE id=p_session_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Sesión de caja inexistente.'; END IF;
 IF NOT private.pw_can_operate_cash_branch(v_session.branch_id) THEN RAISE EXCEPTION 'No tienes autorización para cerrar la caja de esta sucursal.' USING ERRCODE='42501'; END IF;
 IF v_session.status='closed' AND v_session.close_request_id=p_request_id THEN RETURN jsonb_build_object('id',v_session.id,'status','closed','expected_cash',v_session.expected_cash,'difference',v_session.difference,'replayed',true); END IF;
 IF v_session.status<>'open' THEN RAISE EXCEPTION 'La caja ya está cerrada.'; END IF;
 v_summary:=public.pw_cash_summary_v1(v_session.branch_id,v_session.business_date);
 v_expected:=v_session.opening_float+(v_summary->>'cash_sales')::numeric-(v_summary->>'drawer_expenses')::numeric-p_withdrawals;
 UPDATE public.pw_cash_sessions SET counted_cash=p_counted,cash_withdrawals=p_withdrawals,expected_cash=v_expected,
 difference=p_counted-v_expected,status='closed',closed_by=v_actor,closed_at=now(),note=left(coalesce(p_note,''),500),close_request_id=p_request_id WHERE id=v_session.id;
 INSERT INTO public.pw_audit_events(user_id,module,action,entity_id,metadata) VALUES(v_actor,'cash','closed',v_session.id::text,jsonb_build_object('counted',p_counted,'expected',v_expected,'difference',p_counted-v_expected));
 RETURN jsonb_build_object('id',v_session.id,'status','closed','expected_cash',v_expected,'difference',p_counted-v_expected,'replayed',false);
END;$fn$;
REVOKE ALL ON FUNCTION public.pw_open_cash_session_v1(text,date,numeric,uuid),public.pw_close_cash_session_v1(uuid,numeric,numeric,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pw_open_cash_session_v1(text,date,numeric,uuid),public.pw_close_cash_session_v1(uuid,numeric,numeric,text,uuid) TO authenticated;

-- Receipt bug fix: avoid PL/pgSQL record/column name ambiguity and keep receipt atomic.
CREATE OR REPLACE FUNCTION public.pw_receive_branch_delivery_v1(p_delivery_id uuid,p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE a uuid:=auth.uid();v_role text;v_branch text;v_request uuid;v_responsible text;v_lines jsonb;v_line jsonb;v_delivery_line record;v_delivery public.pw_branch_deliveries%ROWTYPE;v_receipt_id uuid;v_tx uuid;v_quantity numeric;v_prior numeric;v_total_missing numeric:=0;v_transit_balance numeric;v_old_receipt public.pw_branch_delivery_receipts%ROWTYPE;
BEGIN
 SELECT m.role,m.branch_id INTO v_role,v_branch FROM public.pw_members m WHERE m.user_id=a AND m.active;
 IF a IS NULL OR v_role NOT IN ('owner','consultant','employee') OR v_role IS NULL THEN RAISE EXCEPTION 'Acceso no autorizado.' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_request) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Solicitud inválida.';END IF;
 v_request:=(p_request->>'request_id')::uuid;v_responsible:=left(btrim(coalesce(p_request->>'responsible','')),160);v_lines:=p_request->'lines';
 IF v_request IS NULL OR v_responsible='' OR jsonb_typeof(v_lines) IS DISTINCT FROM 'array' OR jsonb_array_length(v_lines) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION 'Datos de recepción inválidos.';END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_request::text,1503));
 SELECT * INTO v_delivery FROM public.pw_branch_deliveries WHERE id=p_delivery_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Entrega no encontrada.'; END IF;
 IF v_role='employee' AND v_delivery.destination_location_id IS DISTINCT FROM v_branch THEN RAISE EXCEPTION 'Sucursal no autorizada.' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_old_receipt FROM public.pw_branch_delivery_receipts WHERE request_id=v_request;
 IF FOUND THEN
   IF v_old_receipt.delivery_id IS DISTINCT FROM v_delivery.id OR v_old_receipt.payload_hash IS DISTINCT FROM ('payload:'||md5(p_request::text)) THEN RAISE EXCEPTION 'Solicitud de recepción reutilizada con cambios.'; END IF;
   RETURN jsonb_build_object('id',p_delivery_id,'replayed',true,'status',v_delivery.status,'receipt_id',v_old_receipt.id);
 END IF;
 IF v_delivery.status NOT IN ('dispatched','received_with_differences') THEN RAISE EXCEPTION 'Entrega no disponible para recepción.'; END IF;
 INSERT INTO public.pw_branch_delivery_receipts(delivery_id,request_id,received_by,responsible_name,notes,payload_hash) VALUES(v_delivery.id,v_request,a,v_responsible,nullif(left(btrim(coalesce(p_request->>'notes','')),500),''),'payload:'||md5(p_request::text)) RETURNING id INTO v_receipt_id;
 INSERT INTO public.pw_inventory_transactions(request_id,movement_type,notes,created_by,operation_date,responsible_name) VALUES(v_request,'transfer','receipt:'||md5(p_request::text),a,current_date,v_responsible) RETURNING id INTO v_tx;
 FOR v_line IN SELECT value FROM jsonb_array_elements(v_lines) LOOP
   SELECT * INTO v_delivery_line FROM public.pw_branch_delivery_lines bdl WHERE bdl.id=(v_line->>'delivery_line_id')::uuid AND bdl.delivery_id=v_delivery.id;
   v_quantity:=(v_line->>'quantity')::numeric;
   IF NOT FOUND OR v_quantity IS NULL OR v_quantity<=0 OR v_quantity<>round(v_quantity,3) THEN RAISE EXCEPTION 'Partida de recepción inválida.';END IF;
   SELECT coalesce(sum(brl.received_quantity),0) INTO v_prior FROM public.pw_branch_delivery_receipt_lines brl JOIN public.pw_branch_delivery_receipts br ON br.id=brl.receipt_id WHERE br.delivery_id=v_delivery.id AND brl.delivery_line_id=v_delivery_line.id;
   IF v_prior+v_quantity>v_delivery_line.planned_quantity THEN RAISE EXCEPTION 'La recepción supera lo despachado.';END IF;
   PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('in_transit:'||v_delivery_line.item_id::text,910));
   SELECT coalesce(sum(m.quantity),0) INTO v_transit_balance FROM public.pw_inventory_movements m WHERE m.location_id='in_transit' AND m.item_id=v_delivery_line.item_id;
   IF v_transit_balance<v_quantity THEN RAISE EXCEPTION 'Saldo insuficiente de mercancía en tránsito.';END IF;
   INSERT INTO public.pw_branch_delivery_receipt_lines(receipt_id,delivery_line_id,received_quantity) VALUES(v_receipt_id,v_delivery_line.id,v_quantity);
   INSERT INTO public.pw_inventory_movements(transaction_id,location_id,item_id,quantity) VALUES(v_tx,'in_transit',v_delivery_line.item_id,-v_quantity),(v_tx,v_delivery.destination_location_id,v_delivery_line.item_id,v_quantity);
 END LOOP;
 UPDATE public.pw_branch_delivery_receipts SET inventory_transaction_id=v_tx WHERE id=v_receipt_id;
 FOR v_delivery_line IN SELECT bdl.id,bdl.planned_quantity,coalesce(sum(brl.received_quantity),0) AS got FROM public.pw_branch_delivery_lines bdl LEFT JOIN public.pw_branch_delivery_receipt_lines brl ON brl.delivery_line_id=bdl.id WHERE bdl.delivery_id=v_delivery.id GROUP BY bdl.id,bdl.planned_quantity LOOP v_total_missing:=v_total_missing+(v_delivery_line.planned_quantity-v_delivery_line.got);END LOOP;
 UPDATE public.pw_branch_deliveries SET status=CASE WHEN v_total_missing=0 THEN 'received' ELSE 'received_with_differences' END,received_at=now(),received_by=a WHERE id=v_delivery.id;
 INSERT INTO public.pw_audit_events(user_id,module,action,entity_id,metadata) VALUES(a,'inventory','branch_delivery_received',v_delivery.id::text,jsonb_build_object('receipt_id',v_receipt_id,'transaction_id',v_tx,'pending_in_transit',v_total_missing));
 RETURN jsonb_build_object('id',v_delivery.id,'receipt_id',v_receipt_id,'transaction_id',v_tx,'replayed',false,'status',CASE WHEN v_total_missing=0 THEN 'received' ELSE 'received_with_differences' END,'pending_in_transit',v_total_missing);
END;$fn$;
REVOKE ALL ON FUNCTION public.pw_receive_branch_delivery_v1(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pw_receive_branch_delivery_v1(uuid,jsonb) TO authenticated;

-- Boneless is controlled in grams. 750 g / 10 domos = 75 g per sold order.
DO $seed$
DECLARE v_item uuid;v_next_version integer;v_recipe uuid;
BEGIN
 INSERT INTO public.pw_inventory_items(name,item_type,base_unit,notes,active)
 VALUES('Boneless','raw_material','g','Base de consumo: 750 g por 10 domos; cada venta descuenta 75 g.',true)
 ON CONFLICT (item_type,lower(btrim(name)),lower(btrim(base_unit))) DO UPDATE SET active=true,notes=EXCLUDED.notes
 RETURNING id INTO v_item;
 SELECT id INTO v_recipe FROM public.pw_recipe_versions WHERE product_id='bon' AND status='active';
 IF v_recipe IS NULL THEN
   SELECT coalesce(max(version_no),0)+1 INTO v_next_version FROM public.pw_recipe_versions WHERE product_id='bon';
   INSERT INTO public.pw_recipe_versions(product_id,name,version_no,yield_units,waste_percent,status,created_by)
   VALUES('bon','Boneless · 75 g por domo',v_next_version,1,0,'active',
     (SELECT m.user_id FROM public.pw_members m WHERE m.active AND m.role IN ('owner','consultant') ORDER BY m.user_id LIMIT 1)) RETURNING id INTO v_recipe;
   INSERT INTO public.pw_recipe_lines(recipe_version_id,item_id,quantity,unit) VALUES(v_recipe,v_item,75,'g');
 END IF;
END;$seed$;

-- Sales are a distinct ledger event, never an adjustment disguised as a sale.
ALTER TABLE public.pw_inventory_transactions DROP CONSTRAINT IF EXISTS pw_inventory_transactions_movement_type_check;
ALTER TABLE public.pw_inventory_transactions ADD CONSTRAINT pw_inventory_transactions_movement_type_check
  CHECK (movement_type IN ('opening','purchase','waste','adjustment','transfer','sale'));

-- A recipe version records the input required for its stated yield. This helper
-- converts units, locks stock by branch/item, rejects shortages, and posts one
-- immutable ledger transaction per recipe in the sale.
ALTER TABLE public.pw_sale_recipe_consumptions DROP CONSTRAINT IF EXISTS pw_sale_recipe_consumptions_request_id_key;
ALTER TABLE public.pw_sale_recipe_consumptions DROP CONSTRAINT IF EXISTS pw_sale_recipe_consumptions_sale_id_recipe_version_id_key;
ALTER TABLE public.pw_sale_recipe_consumptions ADD CONSTRAINT pw_sale_recipe_consumptions_sale_id_recipe_version_id_key UNIQUE(sale_id,recipe_version_id);

CREATE OR REPLACE FUNCTION private.pw_post_sale_recipe_inventory_v1(p_sale_id uuid,p_branch_id text,p_request_id uuid,p_actor uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_recipe record;v_item record;v_tx uuid;v_balance numeric;v_quantity numeric;v_sale_date date;
BEGIN
 SELECT s.sale_date INTO v_sale_date FROM public.pw_sales s WHERE s.id=p_sale_id;
 IF v_sale_date IS NULL THEN RAISE EXCEPTION 'Venta inexistente para consumo de receta.'; END IF;
 FOR v_item IN
   SELECT r.id AS recipe_version_id,rl.item_id,
     sum((CASE
       WHEN rl.unit=i.base_unit THEN rl.quantity
       WHEN rl.unit='kg' AND i.base_unit='g' THEN rl.quantity*1000
       WHEN rl.unit='g' AND i.base_unit='kg' THEN rl.quantity/1000
       WHEN rl.unit='l' AND i.base_unit='ml' THEN rl.quantity*1000
       WHEN rl.unit='ml' AND i.base_unit='l' THEN rl.quantity/1000
       ELSE NULL END) * sl.quantity / r.yield_units / (1-r.waste_percent/100.0)) AS quantity
   FROM public.pw_sale_lines sl
   JOIN public.pw_recipe_versions r ON r.product_id=sl.product_id AND r.status='active'
   JOIN public.pw_recipe_lines rl ON rl.recipe_version_id=r.id
   JOIN public.pw_inventory_items i ON i.id=rl.item_id AND i.active
   WHERE sl.sale_id=p_sale_id
   GROUP BY r.id,rl.item_id
   ORDER BY rl.item_id,r.id
 LOOP
   IF v_item.quantity IS NULL OR v_item.quantity<=0 OR v_item.quantity<>round(v_item.quantity,3) THEN RAISE EXCEPTION 'La receta activa contiene una unidad incompatible o un consumo inválido.'; END IF;
   PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_branch_id||':'||v_item.item_id::text,910));
   SELECT coalesce(sum(m.quantity),0) INTO v_balance FROM public.pw_inventory_movements m WHERE m.location_id=p_branch_id AND m.item_id=v_item.item_id;
   IF v_balance<v_item.quantity THEN RAISE EXCEPTION 'Existencia insuficiente para completar la venta según la receta activa.' USING ERRCODE='23514'; END IF;
 END LOOP;
 FOR v_recipe IN
   SELECT DISTINCT r.id AS recipe_version_id
   FROM public.pw_sale_lines sl JOIN public.pw_recipe_versions r ON r.product_id=sl.product_id AND r.status='active'
   WHERE sl.sale_id=p_sale_id
   ORDER BY r.id
 LOOP
   IF EXISTS(SELECT 1 FROM public.pw_sale_recipe_consumptions c WHERE c.sale_id=p_sale_id AND c.recipe_version_id=v_recipe.recipe_version_id) THEN CONTINUE; END IF;
   INSERT INTO public.pw_inventory_transactions(request_id,movement_type,source_id,notes,created_by,operation_date,responsible_name)
   VALUES(p_request_id,'sale',p_sale_id,'sale_recipe:'||v_recipe.recipe_version_id::text,p_actor,v_sale_date,'Consumo automático por venta') RETURNING id INTO v_tx;
   FOR v_item IN
     SELECT rl.item_id,(CASE
       WHEN rl.unit=i.base_unit THEN rl.quantity
       WHEN rl.unit='kg' AND i.base_unit='g' THEN rl.quantity*1000
       WHEN rl.unit='g' AND i.base_unit='kg' THEN rl.quantity/1000
       WHEN rl.unit='l' AND i.base_unit='ml' THEN rl.quantity*1000
       WHEN rl.unit='ml' AND i.base_unit='l' THEN rl.quantity/1000
       ELSE NULL END) * sum(sl.quantity) / r.yield_units / (1-r.waste_percent/100.0) AS quantity
     FROM public.pw_sale_lines sl JOIN public.pw_recipe_lines rl ON true JOIN public.pw_inventory_items i ON i.id=rl.item_id AND i.active JOIN public.pw_recipe_versions r ON r.id=v_recipe.recipe_version_id
     WHERE sl.sale_id=p_sale_id AND sl.product_id=r.product_id AND rl.recipe_version_id=r.id
     GROUP BY rl.item_id,rl.unit,i.base_unit,rl.quantity,r.yield_units,r.waste_percent
   LOOP
     INSERT INTO public.pw_inventory_movements(transaction_id,location_id,item_id,quantity) VALUES(v_tx,p_branch_id,v_item.item_id,-round(v_item.quantity,3));
   END LOOP;
   INSERT INTO public.pw_sale_recipe_consumptions(sale_id,recipe_version_id,inventory_transaction_id,request_id)
   VALUES(p_sale_id,v_recipe.recipe_version_id,v_tx,p_request_id);
   INSERT INTO public.pw_audit_events(user_id,module,action,entity_id,metadata)
   VALUES(p_actor,'inventory','sale_recipe_consumed',v_tx::text,jsonb_build_object('sale_id',p_sale_id,'recipe_version_id',v_recipe.recipe_version_id));
 END LOOP;
END;$fn$;
REVOKE ALL ON FUNCTION private.pw_post_sale_recipe_inventory_v1(uuid,text,uuid,uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.pw_register_sale_v3(p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_result jsonb;v_sale_id uuid;v_branch_id text;v_request_id uuid;
BEGIN
 v_result:=public.pw_register_sale_v2(p_request);
 v_sale_id:=(v_result->>'id')::uuid;v_branch_id:=v_result->>'branch_id';v_request_id:=(p_request->>'request_id')::uuid;
 PERFORM private.pw_post_sale_recipe_inventory_v1(v_sale_id,v_branch_id,v_request_id,auth.uid());
 RETURN v_result;
END;$fn$;
REVOKE ALL ON FUNCTION public.pw_register_sale_v3(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pw_register_sale_v3(jsonb) TO authenticated;

-- Test cleanup is deliberately limited: it cannot erase a sale, purchase,
-- received delivery, or any movement generated from a recipe sale.
CREATE OR REPLACE FUNCTION public.pw_delete_inventory_test_transaction_v1(p_transaction_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor uuid:=auth.uid();v_tx public.pw_inventory_transactions%ROWTYPE;
BEGIN
 IF v_actor IS NULL OR NOT private.pw_is_manager() THEN RAISE EXCEPTION 'Solo administración puede eliminar pruebas.' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_tx FROM public.pw_inventory_transactions WHERE id=p_transaction_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Movimiento inexistente.'; END IF;
 IF v_tx.movement_type NOT IN ('opening','waste','adjustment') OR v_tx.source_id IS NOT NULL OR EXISTS(SELECT 1 FROM public.pw_sale_recipe_consumptions c WHERE c.inventory_transaction_id=v_tx.id) THEN RAISE EXCEPTION 'Sólo se pueden eliminar movimientos manuales de prueba sin documentos asociados.'; END IF;
 DELETE FROM public.pw_inventory_movements WHERE transaction_id=v_tx.id;
 DELETE FROM public.pw_audit_events WHERE module='inventory' AND entity_id=v_tx.id::text;
 DELETE FROM public.pw_inventory_transactions WHERE id=v_tx.id;
 RETURN jsonb_build_object('id',p_transaction_id,'deleted',true);
END;$fn$;
REVOKE ALL ON FUNCTION public.pw_delete_inventory_test_transaction_v1(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pw_delete_inventory_test_transaction_v1(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.pw_delete_branch_delivery_test_v1(p_delivery_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor uuid:=auth.uid();v_delivery public.pw_branch_deliveries%ROWTYPE;v_tx uuid;
BEGIN
 IF v_actor IS NULL OR NOT private.pw_is_manager() THEN RAISE EXCEPTION 'Solo administración puede eliminar pruebas.' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_delivery FROM public.pw_branch_deliveries WHERE id=p_delivery_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Entrega inexistente.'; END IF;
 IF v_delivery.status NOT IN ('draft','dispatched') OR EXISTS(SELECT 1 FROM public.pw_branch_delivery_receipts r WHERE r.delivery_id=v_delivery.id) THEN
   RAISE EXCEPTION 'Sólo se puede eliminar una entrega de prueba que aún no tenga recepción.';
 END IF;
 v_tx:=v_delivery.dispatch_transaction_id;
 DELETE FROM public.pw_branch_delivery_lines WHERE delivery_id=v_delivery.id;
 DELETE FROM public.pw_branch_deliveries WHERE id=v_delivery.id;
 IF v_tx IS NOT NULL THEN
   DELETE FROM public.pw_inventory_movements WHERE transaction_id=v_tx;
   DELETE FROM public.pw_inventory_transactions WHERE id=v_tx;
 END IF;
 DELETE FROM public.pw_audit_events WHERE module='inventory' AND entity_id=v_delivery.id::text;
 RETURN jsonb_build_object('id',p_delivery_id,'deleted',true);
END;$fn$;
REVOKE ALL ON FUNCTION public.pw_delete_branch_delivery_test_v1(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pw_delete_branch_delivery_test_v1(uuid) TO authenticated;

COMMIT;
