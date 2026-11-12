-- Plebes Wings 12: immediate, confirmed transfers between locations.
-- Does not model goods in transit: execute only AFTER physical handoff is accepted.
-- Prerequisite: migration 09.
BEGIN;
ALTER TABLE public.pw_inventory_transactions DROP CONSTRAINT IF EXISTS pw_inventory_transactions_movement_type_check;
ALTER TABLE public.pw_inventory_transactions ADD CONSTRAINT pw_inventory_transactions_movement_type_check
 CHECK (movement_type IN ('opening','purchase','waste','adjustment','transfer'));
CREATE OR REPLACE FUNCTION public.pw_transfer_stock_v1(p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor uuid:=auth.uid();v_req uuid;v_source text;v_dest text;v_item uuid;v_qty numeric;v_balance numeric;v_tx uuid;v_existing public.pw_inventory_transactions%ROWTYPE;
BEGIN
 IF v_actor IS NULL OR NOT private.pw_is_manager() THEN RAISE EXCEPTION 'Traspaso reservado a administración.' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_request)<>'object' THEN RAISE EXCEPTION 'Solicitud inválida.'; END IF;
 v_req:=(p_request->>'request_id')::uuid;v_source:=p_request->>'from_location_id';v_dest:=p_request->>'to_location_id';
 v_item:=(p_request->>'item_id')::uuid;v_qty:=(p_request->>'quantity')::numeric;
 IF v_req IS NULL OR v_source IS NULL OR v_dest IS NULL OR v_source=v_dest OR v_item IS NULL OR v_qty IS NULL OR v_qty<=0 OR v_qty<>round(v_qty,3) THEN RAISE EXCEPTION 'Datos de traspaso inválidos.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.pw_stock_locations WHERE id=v_source AND active) OR
 NOT EXISTS(SELECT 1 FROM public.pw_stock_locations WHERE id=v_dest AND active) THEN RAISE EXCEPTION 'Ubicación inválida.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.pw_inventory_items WHERE id=v_item AND active) THEN RAISE EXCEPTION 'Insumo inválido.'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_req::text,1201));
 SELECT * INTO v_existing FROM public.pw_inventory_transactions WHERE request_id=v_req;
 IF FOUND THEN
  IF v_existing.notes IS DISTINCT FROM ('payload:'||md5(p_request::text)) THEN RAISE EXCEPTION 'Solicitud reutilizada con cambios.'; END IF;
  RETURN jsonb_build_object('id',v_existing.id,'replayed',true);
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_source||':'||v_item::text,910));
 SELECT coalesce(sum(quantity),0) INTO v_balance FROM public.pw_inventory_movements WHERE location_id=v_source AND item_id=v_item;
 IF v_balance<v_qty THEN RAISE EXCEPTION 'Saldo insuficiente para el traspaso.'; END IF;
 INSERT INTO public.pw_inventory_transactions(request_id,movement_type,notes,created_by)
 VALUES(v_req,'transfer','payload:'||md5(p_request::text),v_actor) RETURNING id INTO v_tx;
 INSERT INTO public.pw_inventory_movements(transaction_id,location_id,item_id,quantity)
 VALUES(v_tx,v_source,v_item,-v_qty),(v_tx,v_dest,v_item,v_qty);
 INSERT INTO public.pw_audit_events(user_id,module,action,entity_id,metadata)
 VALUES(v_actor,'inventory','transfer',v_tx::text,jsonb_build_object('origin',v_source,'destination',v_dest,'item_id',v_item,'quantity',v_qty));
 RETURN jsonb_build_object('id',v_tx,'replayed',false);
END;$fn$;
REVOKE ALL ON FUNCTION public.pw_transfer_stock_v1(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pw_transfer_stock_v1(jsonb) TO authenticated;
COMMIT;
