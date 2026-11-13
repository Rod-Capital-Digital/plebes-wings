-- REVIEW-ONLY MIGRATION: do not apply to production without staging validation.
-- Atomic, idempotent, multi-line deliveries from Almacén central to a branch.
BEGIN;

ALTER TABLE public.pw_inventory_transactions
  ADD COLUMN IF NOT EXISTS operation_date date,
  ADD COLUMN IF NOT EXISTS responsible_name text,
  ADD COLUMN IF NOT EXISTS operation_reason text,
  ADD COLUMN IF NOT EXISTS reversal_of uuid REFERENCES public.pw_inventory_transactions(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS pw_inventory_transactions_one_reversal_idx
  ON public.pw_inventory_transactions(reversal_of) WHERE reversal_of IS NOT NULL;

ALTER TABLE public.pw_inventory_transactions DROP CONSTRAINT IF EXISTS pw_inventory_transactions_movement_type_check;
ALTER TABLE public.pw_inventory_transactions ADD CONSTRAINT pw_inventory_transactions_movement_type_check
  CHECK (movement_type IN ('opening','purchase','waste','adjustment','transfer','reversal'));

ALTER TABLE public.pw_inventory_transactions
  DROP CONSTRAINT IF EXISTS pw_inventory_transactions_responsible_name_check;
ALTER TABLE public.pw_inventory_transactions
  ADD CONSTRAINT pw_inventory_transactions_responsible_name_check
  CHECK (responsible_name IS NULL OR btrim(responsible_name) <> '');

CREATE OR REPLACE FUNCTION public.pw_prepare_branch_delivery_v1(p_request jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_actor uuid:=auth.uid(); v_request uuid; v_date date; v_destination text;
  v_responsible text; v_notes text; v_lines jsonb; v_line jsonb; v_item uuid;
  v_quantity numeric; v_balance numeric; v_tx uuid; v_existing public.pw_inventory_transactions%ROWTYPE;
  v_seen uuid[]:=ARRAY[]::uuid[];
BEGIN
  IF v_actor IS NULL OR NOT private.pw_is_manager() THEN
    RAISE EXCEPTION 'Entrega reservada a administración.' USING ERRCODE='42501';
  END IF;
  IF jsonb_typeof(p_request) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Solicitud inválida.'; END IF;
  v_request:=(p_request->>'request_id')::uuid;
  v_destination:=nullif(btrim(p_request->>'destination_location_id'),'');
  v_responsible:=left(btrim(coalesce(p_request->>'responsible','')),160);
  v_notes:=left(btrim(coalesce(p_request->>'notes','')),500);
  v_lines:=p_request->'lines';
  IF v_request IS NULL OR coalesce(p_request->>'delivery_date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     OR v_destination IS NULL OR v_responsible='' OR jsonb_typeof(v_lines) IS DISTINCT FROM 'array'
     OR jsonb_array_length(v_lines) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION 'Datos de entrega inválidos.'; END IF;
  v_date:=(p_request->>'delivery_date')::date;
  IF NOT EXISTS (SELECT 1 FROM public.pw_stock_locations WHERE id='central' AND location_type='central' AND active)
     OR NOT EXISTS (SELECT 1 FROM public.pw_stock_locations WHERE id=v_destination AND location_type='branch' AND active) THEN
    RAISE EXCEPTION 'Origen o sucursal destino inválidos.';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_request::text,1401));
  SELECT * INTO v_existing FROM public.pw_inventory_transactions WHERE request_id=v_request;
  IF FOUND THEN
    IF v_existing.notes IS DISTINCT FROM ('payload:'||md5(p_request::text)) THEN RAISE EXCEPTION 'Solicitud reutilizada con cambios.'; END IF;
    RETURN jsonb_build_object('id',v_existing.id,'replayed',true);
  END IF;
  FOR v_line IN SELECT value FROM jsonb_array_elements(v_lines) LOOP
    IF jsonb_typeof(v_line) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Partida inválida.'; END IF;
    v_item:=(v_line->>'item_id')::uuid; v_quantity:=(v_line->>'quantity')::numeric;
    IF v_item IS NULL OR v_item=ANY(v_seen) OR v_quantity IS NULL OR v_quantity<=0
       OR v_quantity<>round(v_quantity,3) OR v_quantity>1000000 THEN RAISE EXCEPTION 'Partida de entrega inválida o duplicada.'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.pw_inventory_items WHERE id=v_item AND active) THEN RAISE EXCEPTION 'Artículo inexistente o inactivo.'; END IF;
    v_seen:=array_append(v_seen,v_item);
  END LOOP;
  -- Lock source balances in a deterministic order, then validate every line before writing.
  FOREACH v_item IN ARRAY (SELECT unnest(v_seen) ORDER BY 1) LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('central:'||v_item::text,910));
  END LOOP;
  FOR v_line IN SELECT value FROM jsonb_array_elements(v_lines) LOOP
    v_item:=(v_line->>'item_id')::uuid; v_quantity:=(v_line->>'quantity')::numeric;
    SELECT coalesce(sum(quantity),0) INTO v_balance FROM public.pw_inventory_movements WHERE location_id='central' AND item_id=v_item;
    IF v_balance<v_quantity THEN RAISE EXCEPTION 'Saldo insuficiente en Almacén central.'; END IF;
  END LOOP;
  INSERT INTO public.pw_inventory_transactions(request_id,movement_type,notes,created_by,operation_date,responsible_name,operation_reason)
  VALUES(v_request,'transfer','payload:'||md5(p_request::text),v_actor,v_date,v_responsible,nullif(v_notes,'')) RETURNING id INTO v_tx;
  FOR v_line IN SELECT value FROM jsonb_array_elements(v_lines) LOOP
    v_item:=(v_line->>'item_id')::uuid; v_quantity:=(v_line->>'quantity')::numeric;
    INSERT INTO public.pw_inventory_movements(transaction_id,location_id,item_id,quantity)
    VALUES(v_tx,'central',v_item,-v_quantity),(v_tx,v_destination,v_item,v_quantity);
  END LOOP;
  INSERT INTO public.pw_audit_events(user_id,module,action,entity_id,metadata)
  VALUES(v_actor,'inventory','branch_delivery_confirmed',v_tx::text,jsonb_build_object('source_location_id','central','destination_location_id',v_destination,'delivery_date',v_date,'responsible',v_responsible,'notes',v_notes,'line_count',jsonb_array_length(v_lines)));
  RETURN jsonb_build_object('id',v_tx,'replayed',false,'source_location_id','central','destination_location_id',v_destination);
END;$fn$;

REVOKE ALL ON FUNCTION public.pw_prepare_branch_delivery_v1(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pw_prepare_branch_delivery_v1(jsonb) TO authenticated;

-- Ledger rows are immutable for application roles. A confirmed delivery may only be
-- countered by this idempotent, fully audited reversal; it never updates or deletes rows.
CREATE OR REPLACE FUNCTION public.pw_reverse_branch_delivery_v1(p_request jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_actor uuid:=auth.uid(); v_request uuid; v_original_id uuid; v_reason text; v_original public.pw_inventory_transactions%ROWTYPE;
  v_existing public.pw_inventory_transactions%ROWTYPE; v_movement record; v_balance numeric; v_tx uuid;
BEGIN
  IF v_actor IS NULL OR NOT private.pw_is_manager() THEN RAISE EXCEPTION 'Reversión reservada a administración.' USING ERRCODE='42501'; END IF;
  IF jsonb_typeof(p_request) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Solicitud inválida.'; END IF;
  v_request:=(p_request->>'request_id')::uuid; v_original_id:=(p_request->>'original_transaction_id')::uuid;
  v_reason:=left(btrim(coalesce(p_request->>'reason','')),500);
  IF v_request IS NULL OR v_original_id IS NULL OR v_reason='' THEN RAISE EXCEPTION 'Datos de reversión inválidos.'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_request::text,1402));
  SELECT * INTO v_existing FROM public.pw_inventory_transactions WHERE request_id=v_request;
  IF FOUND THEN
    IF v_existing.notes IS DISTINCT FROM ('payload:'||md5(p_request::text)) THEN RAISE EXCEPTION 'Solicitud reutilizada con cambios.'; END IF;
    RETURN jsonb_build_object('id',v_existing.id,'replayed',true);
  END IF;
  SELECT * INTO v_original FROM public.pw_inventory_transactions WHERE id=v_original_id FOR UPDATE;
  IF NOT FOUND OR v_original.movement_type<>'transfer' OR NOT EXISTS (
    SELECT 1 FROM public.pw_inventory_movements WHERE transaction_id=v_original_id AND location_id='central' AND quantity<0
  ) THEN RAISE EXCEPTION 'Sólo se puede revertir una entrega confirmada desde central.'; END IF;
  IF EXISTS (SELECT 1 FROM public.pw_inventory_transactions WHERE reversal_of=v_original_id) THEN RAISE EXCEPTION 'La entrega ya tiene una reversión registrada.'; END IF;
  FOR v_movement IN SELECT location_id,item_id,quantity FROM public.pw_inventory_movements WHERE transaction_id=v_original_id ORDER BY location_id,item_id LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_movement.location_id||':'||v_movement.item_id::text,910));
    IF v_movement.quantity>0 THEN
      SELECT coalesce(sum(quantity),0) INTO v_balance FROM public.pw_inventory_movements WHERE location_id=v_movement.location_id AND item_id=v_movement.item_id;
      IF v_balance<v_movement.quantity THEN RAISE EXCEPTION 'No se puede revertir: la sucursal ya no tiene existencias suficientes.'; END IF;
    END IF;
  END LOOP;
  INSERT INTO public.pw_inventory_transactions(request_id,movement_type,notes,created_by,operation_date,responsible_name,operation_reason,reversal_of)
  VALUES(v_request,'reversal','payload:'||md5(p_request::text),v_actor,current_date,NULL,v_reason,v_original_id) RETURNING id INTO v_tx;
  INSERT INTO public.pw_inventory_movements(transaction_id,location_id,item_id,quantity)
  SELECT v_tx,location_id,item_id,-quantity FROM public.pw_inventory_movements WHERE transaction_id=v_original_id;
  INSERT INTO public.pw_audit_events(user_id,module,action,entity_id,metadata)
  VALUES(v_actor,'inventory','branch_delivery_reversed',v_tx::text,jsonb_build_object('original_transaction_id',v_original_id,'reason',v_reason));
  RETURN jsonb_build_object('id',v_tx,'replayed',false,'reversal_of',v_original_id);
END;$fn$;
REVOKE ALL ON FUNCTION public.pw_reverse_branch_delivery_v1(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pw_reverse_branch_delivery_v1(jsonb) TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.pw_inventory_transactions,public.pw_inventory_movements FROM anon,authenticated;
COMMIT;
