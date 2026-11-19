-- Plebes Wings 24: traceable conversion of a raw material into prepared stock.
-- A production batch is centralized: it consumes the source item and credits
-- the prepared item in the same immutable inventory transaction.
BEGIN;

CREATE TABLE IF NOT EXISTS public.pw_inventory_productions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE,
  payload_hash text NOT NULL,
  production_date date NOT NULL,
  location_id text NOT NULL REFERENCES public.pw_stock_locations(id) ON DELETE RESTRICT,
  input_item_id uuid NOT NULL REFERENCES public.pw_inventory_items(id) ON DELETE RESTRICT,
  output_item_id uuid NOT NULL REFERENCES public.pw_inventory_items(id) ON DELETE RESTRICT,
  input_quantity numeric NOT NULL CHECK (input_quantity > 0 AND input_quantity = round(input_quantity,3)),
  output_quantity numeric NOT NULL CHECK (output_quantity > 0 AND output_quantity = round(output_quantity,3)),
  responsible_name text NOT NULL CHECK (btrim(responsible_name) <> ''),
  notes text NULL CHECK (notes IS NULL OR btrim(notes) <> ''),
  inventory_transaction_id uuid NULL UNIQUE REFERENCES public.pw_inventory_transactions(id) ON DELETE RESTRICT,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (input_item_id <> output_item_id),
  CHECK (char_length(responsible_name) <= 160),
  CHECK (notes IS NULL OR char_length(notes) <= 500)
);
ALTER TABLE public.pw_inventory_productions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.pw_inventory_productions FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.pw_inventory_productions TO authenticated;
DROP POLICY IF EXISTS pw_inventory_productions_manager_read ON public.pw_inventory_productions;
CREATE POLICY pw_inventory_productions_manager_read ON public.pw_inventory_productions
  FOR SELECT TO authenticated USING (private.pw_is_manager());

-- Make the inventory role explicit: raw chicken is transformed into prepared
-- boneless, while the active 75 g sale recipe continues to consume this item.
UPDATE public.pw_inventory_items
SET name='Boneless preparado', item_type='semi_finished',
    notes='Producto preparado para venta: 750 g rinden 10 domos; cada venta descuenta 75 g.'
WHERE lower(btrim(name))='boneless' AND lower(btrim(base_unit))='g';

ALTER TABLE public.pw_inventory_transactions DROP CONSTRAINT IF EXISTS pw_inventory_transactions_movement_type_check;
ALTER TABLE public.pw_inventory_transactions ADD CONSTRAINT pw_inventory_transactions_movement_type_check
  CHECK (movement_type IN ('opening','purchase','waste','adjustment','transfer','sale','production'));

CREATE OR REPLACE FUNCTION public.pw_produce_inventory_v1(p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE
  v_actor uuid:=auth.uid();
  v_request_id uuid;
  v_hash text;
  v_location text;
  v_input_item uuid;
  v_output_item uuid;
  v_input_quantity numeric;
  v_output_quantity numeric;
  v_date date;
  v_responsible text;
  v_notes text;
  v_production public.pw_inventory_productions%ROWTYPE;
  v_tx uuid;
  v_input_balance numeric;
  v_input_unit text;
  v_output_unit text;
  v_lock_item uuid;
BEGIN
  IF v_actor IS NULL OR NOT private.pw_is_manager() THEN
    RAISE EXCEPTION 'Sólo administración puede registrar preparación.' USING ERRCODE='42501';
  END IF;
  IF jsonb_typeof(p_request) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Solicitud de preparación inválida.'; END IF;
  v_request_id:=(p_request->>'request_id')::uuid;
  v_location:=btrim(coalesce(p_request->>'location_id',''));
  v_input_item:=(p_request->>'input_item_id')::uuid;
  v_output_item:=(p_request->>'output_item_id')::uuid;
  v_input_quantity:=(p_request->>'input_quantity')::numeric;
  v_output_quantity:=(p_request->>'output_quantity')::numeric;
  v_date:=(p_request->>'production_date')::date;
  v_responsible:=left(btrim(coalesce(p_request->>'responsible_name','')),160);
  v_notes:=nullif(left(btrim(coalesce(p_request->>'notes','')),500),'');
  v_hash:='payload:'||md5(p_request::text);
  IF v_request_id IS NULL OR v_location<>'central' OR v_input_item IS NULL OR v_output_item IS NULL
     OR v_input_item=v_output_item OR v_input_quantity IS NULL OR v_output_quantity IS NULL
     OR v_input_quantity<=0 OR v_output_quantity<=0 OR v_input_quantity<>round(v_input_quantity,3)
     OR v_output_quantity<>round(v_output_quantity,3) OR v_date IS NULL OR v_responsible='' THEN
    RAISE EXCEPTION 'Datos de preparación inválidos.';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_request_id::text,1504));
  SELECT * INTO v_production FROM public.pw_inventory_productions WHERE request_id=v_request_id;
  IF FOUND THEN
    IF v_production.payload_hash IS DISTINCT FROM v_hash THEN RAISE EXCEPTION 'Solicitud de preparación reutilizada con cambios.'; END IF;
    RETURN jsonb_build_object('id',v_production.id,'transaction_id',v_production.inventory_transaction_id,'replayed',true);
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.pw_stock_locations WHERE id='central' AND active) THEN RAISE EXCEPTION 'El almacén central no está disponible.'; END IF;
  SELECT base_unit INTO v_input_unit FROM public.pw_inventory_items WHERE id=v_input_item AND active;
  SELECT base_unit INTO v_output_unit FROM public.pw_inventory_items WHERE id=v_output_item AND active;
  IF v_input_unit IS NULL OR v_output_unit IS NULL OR v_input_unit<>v_output_unit THEN
    RAISE EXCEPTION 'Los artículos de preparación deben estar activos y usar la misma unidad base.';
  END IF;
  FOR v_lock_item IN SELECT item_id FROM (VALUES (v_input_item),(v_output_item)) AS locks(item_id) ORDER BY item_id LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_location||':'||v_lock_item::text,910));
  END LOOP;
  SELECT coalesce(sum(quantity),0) INTO v_input_balance FROM public.pw_inventory_movements WHERE location_id=v_location AND item_id=v_input_item;
  IF v_input_balance<v_input_quantity THEN RAISE EXCEPTION 'Existencia insuficiente de insumo para preparar el producto.' USING ERRCODE='23514'; END IF;
  INSERT INTO public.pw_inventory_productions(request_id,payload_hash,production_date,location_id,input_item_id,output_item_id,input_quantity,output_quantity,responsible_name,notes,created_by)
  VALUES(v_request_id,v_hash,v_date,v_location,v_input_item,v_output_item,v_input_quantity,v_output_quantity,v_responsible,v_notes,v_actor)
  RETURNING * INTO v_production;
  INSERT INTO public.pw_inventory_transactions(request_id,movement_type,source_id,notes,created_by,operation_date,responsible_name)
  VALUES(v_request_id,'production',v_production.id,'production:'||v_production.id::text,v_actor,v_date,v_responsible)
  RETURNING id INTO v_tx;
  INSERT INTO public.pw_inventory_movements(transaction_id,location_id,item_id,quantity)
  VALUES(v_tx,v_location,v_input_item,-v_input_quantity),(v_tx,v_location,v_output_item,v_output_quantity);
  UPDATE public.pw_inventory_productions SET inventory_transaction_id=v_tx WHERE id=v_production.id;
  INSERT INTO public.pw_audit_events(user_id,module,action,entity_id,metadata)
  VALUES(v_actor,'inventory','production_completed',v_production.id::text,jsonb_build_object(
    'transaction_id',v_tx,'location_id',v_location,'input_item_id',v_input_item,'input_quantity',v_input_quantity,
    'output_item_id',v_output_item,'output_quantity',v_output_quantity));
  RETURN jsonb_build_object('id',v_production.id,'transaction_id',v_tx,'replayed',false);
END;$fn$;
REVOKE ALL ON FUNCTION public.pw_produce_inventory_v1(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pw_produce_inventory_v1(jsonb) TO authenticated;

COMMIT;
