-- REVIEW-ONLY: pending branch deliveries. Do not apply to production.
-- Dispatch debits central and credits the in_transit location. Each receipt debits
-- in_transit and credits only the quantities physically accepted by the branch.
BEGIN;

ALTER TABLE public.pw_stock_locations DROP CONSTRAINT IF EXISTS pw_stock_locations_type;
ALTER TABLE public.pw_stock_locations ADD CONSTRAINT pw_stock_locations_type CHECK (location_type IN ('central','branch','transit'));
ALTER TABLE public.pw_stock_locations DROP CONSTRAINT IF EXISTS pw_stock_locations_branch_mapping;
ALTER TABLE public.pw_stock_locations ADD CONSTRAINT pw_stock_locations_branch_mapping CHECK (
 (location_type='central' AND branch_id IS NULL) OR (location_type='branch' AND branch_id IS NOT NULL) OR (location_type='transit' AND branch_id IS NULL));
INSERT INTO public.pw_stock_locations(id,name,location_type,branch_id,description,active)
VALUES('in_transit','Mercancía en tránsito','transit',NULL,'Existencia despachada y aún no recibida por una sucursal.',true)
ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,location_type=EXCLUDED.location_type,branch_id=NULL,active=true;

CREATE TABLE IF NOT EXISTS public.pw_branch_deliveries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL UNIQUE,
 origin_location_id text NOT NULL REFERENCES public.pw_stock_locations(id) ON DELETE RESTRICT,
 destination_location_id text NOT NULL REFERENCES public.pw_stock_locations(id) ON DELETE RESTRICT,
 delivery_date date NOT NULL, status text NOT NULL DEFAULT 'draft', prepared_responsible text NOT NULL,
 notes text, payload_hash text NOT NULL, prepared_by uuid NOT NULL REFERENCES auth.users(id), prepared_at timestamptz NOT NULL DEFAULT now(),
 dispatched_at timestamptz, dispatched_by uuid REFERENCES auth.users(id), dispatch_responsible text, dispatch_notes text, dispatch_request_id uuid UNIQUE, dispatch_transaction_id uuid UNIQUE REFERENCES public.pw_inventory_transactions(id) ON DELETE RESTRICT,
 received_at timestamptz, received_by uuid REFERENCES auth.users(id),
 CONSTRAINT pw_branch_deliveries_locations CHECK (origin_location_id='central' AND destination_location_id NOT IN ('central','in_transit')),
 CONSTRAINT pw_branch_deliveries_status CHECK (status IN ('draft','dispatched','received','received_with_differences','cancelled')),
 CONSTRAINT pw_branch_deliveries_responsible CHECK (btrim(prepared_responsible)<>''),
 CONSTRAINT pw_branch_deliveries_state CHECK ((status='draft' AND dispatched_at IS NULL) OR (status='cancelled' AND dispatched_at IS NULL) OR (status IN ('dispatched','received','received_with_differences') AND dispatched_at IS NOT NULL AND dispatch_transaction_id IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS public.pw_branch_delivery_lines (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), delivery_id uuid NOT NULL REFERENCES public.pw_branch_deliveries(id) ON DELETE RESTRICT,
 item_id uuid NOT NULL REFERENCES public.pw_inventory_items(id) ON DELETE RESTRICT, planned_quantity numeric(14,3) NOT NULL CHECK(planned_quantity>0),
 UNIQUE(delivery_id,item_id)
);
CREATE TABLE IF NOT EXISTS public.pw_branch_delivery_receipts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), delivery_id uuid NOT NULL REFERENCES public.pw_branch_deliveries(id) ON DELETE RESTRICT,
 request_id uuid NOT NULL UNIQUE, received_at timestamptz NOT NULL DEFAULT now(), received_by uuid NOT NULL REFERENCES auth.users(id), responsible_name text NOT NULL,
 notes text, payload_hash text NOT NULL, inventory_transaction_id uuid UNIQUE REFERENCES public.pw_inventory_transactions(id) ON DELETE RESTRICT,
 CONSTRAINT pw_branch_delivery_receipts_responsible CHECK(btrim(responsible_name)<>'')
);
CREATE TABLE IF NOT EXISTS public.pw_branch_delivery_receipt_lines (
 receipt_id uuid NOT NULL REFERENCES public.pw_branch_delivery_receipts(id) ON DELETE RESTRICT,
 delivery_line_id uuid NOT NULL REFERENCES public.pw_branch_delivery_lines(id) ON DELETE RESTRICT,
 received_quantity numeric(14,3) NOT NULL CHECK(received_quantity>0), PRIMARY KEY(receipt_id,delivery_line_id)
);
CREATE INDEX IF NOT EXISTS pw_branch_deliveries_destination_status_idx ON public.pw_branch_deliveries(destination_location_id,status,delivery_date DESC);
CREATE INDEX IF NOT EXISTS pw_branch_delivery_lines_delivery_idx ON public.pw_branch_delivery_lines(delivery_id);
CREATE INDEX IF NOT EXISTS pw_branch_delivery_receipts_delivery_idx ON public.pw_branch_delivery_receipts(delivery_id,received_at);

-- The ledger's shared in_transit location is an internal clearing account.
-- Legacy adjustment/stock-transfer RPCs must not be able to move its stock without
-- a delivery-specific receipt or dispatch. Application roles lack ledger INSERT.
CREATE OR REPLACE FUNCTION private.pw_guard_transit_inventory_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $guard$
DECLARE v_kind text; v_notes text;
BEGIN
  IF NEW.location_id = 'in_transit' THEN
    SELECT movement_type,notes INTO v_kind,v_notes
    FROM public.pw_inventory_transactions WHERE id=NEW.transaction_id;
    IF v_kind IS DISTINCT FROM 'transfer' OR
       coalesce(v_notes,'') !~ '^(dispatch|receipt):[0-9a-f]{32}$' THEN
      RAISE EXCEPTION 'El inventario en tránsito sólo se mueve mediante despacho o recepción de una entrega.'
        USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN NEW;
END;$guard$;
REVOKE ALL ON FUNCTION private.pw_guard_transit_inventory_v1() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS pw_guard_transit_inventory_v1 ON public.pw_inventory_movements;
CREATE TRIGGER pw_guard_transit_inventory_v1
BEFORE INSERT OR UPDATE OF location_id,transaction_id ON public.pw_inventory_movements
FOR EACH ROW EXECUTE FUNCTION private.pw_guard_transit_inventory_v1();

ALTER TABLE public.pw_branch_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pw_branch_delivery_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pw_branch_delivery_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pw_branch_delivery_receipt_lines ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pw_branch_deliveries,public.pw_branch_delivery_lines,public.pw_branch_delivery_receipts,public.pw_branch_delivery_receipt_lines FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.pw_branch_deliveries,public.pw_branch_delivery_lines,public.pw_branch_delivery_receipts,public.pw_branch_delivery_receipt_lines TO authenticated;
CREATE POLICY pw_branch_deliveries_read ON public.pw_branch_deliveries FOR SELECT TO authenticated USING ((SELECT private.pw_is_manager()) OR (SELECT private.pw_can_read_branch((SELECT branch_id FROM public.pw_stock_locations WHERE id=destination_location_id))));
CREATE POLICY pw_branch_delivery_lines_read ON public.pw_branch_delivery_lines FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM public.pw_branch_deliveries d WHERE d.id=delivery_id));
CREATE POLICY pw_branch_delivery_receipts_read ON public.pw_branch_delivery_receipts FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM public.pw_branch_deliveries d WHERE d.id=delivery_id));
CREATE POLICY pw_branch_delivery_receipt_lines_read ON public.pw_branch_delivery_receipt_lines FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM public.pw_branch_delivery_receipts r WHERE r.id=receipt_id));

CREATE OR REPLACE FUNCTION public.pw_create_branch_delivery_v1(p_request jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE a uuid:=auth.uid(); q uuid; dest text; who text; d date; lines jsonb; x jsonb; item uuid; qty numeric; seen uuid[]:=ARRAY[]::uuid[]; old public.pw_branch_deliveries%ROWTYPE; did uuid;
BEGIN
 IF a IS NULL OR NOT private.pw_is_manager() THEN RAISE EXCEPTION 'Entrega reservada a administración.' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_request) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Solicitud inválida.'; END IF;
 q:=(p_request->>'request_id')::uuid; dest:=nullif(btrim(p_request->>'destination_location_id'),''); who:=left(btrim(coalesce(p_request->>'responsible','')),160); lines:=p_request->'lines'; d:=(p_request->>'delivery_date')::date;
 IF q IS NULL OR dest IS NULL OR who='' OR jsonb_typeof(lines) IS DISTINCT FROM 'array' OR jsonb_array_length(lines) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION 'Datos de entrega inválidos.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.pw_stock_locations WHERE id=dest AND location_type='branch' AND active) THEN RAISE EXCEPTION 'Sucursal destino inválida.'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(q::text,1501)); SELECT * INTO old FROM public.pw_branch_deliveries WHERE request_id=q;
 IF FOUND THEN IF old.payload_hash<>('payload:'||md5(p_request::text)) THEN RAISE EXCEPTION 'Solicitud reutilizada con cambios.'; END IF; RETURN jsonb_build_object('id',old.id,'replayed',true,'status',old.status); END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(lines) LOOP item:=(x->>'item_id')::uuid; qty:=(x->>'quantity')::numeric; IF item IS NULL OR item=ANY(seen) OR qty IS NULL OR qty<=0 OR qty<>round(qty,3) OR qty>1000000 OR NOT EXISTS(SELECT 1 FROM public.pw_inventory_items WHERE id=item AND active) THEN RAISE EXCEPTION 'Partida inválida o duplicada.'; END IF; seen:=array_append(seen,item); END LOOP;
 INSERT INTO public.pw_branch_deliveries(request_id,origin_location_id,destination_location_id,delivery_date,prepared_responsible,notes,payload_hash,prepared_by) VALUES(q,'central',dest,d,who,nullif(left(btrim(coalesce(p_request->>'notes','')),500),''),'payload:'||md5(p_request::text),a) RETURNING id INTO did;
 FOR x IN SELECT value FROM jsonb_array_elements(lines) LOOP INSERT INTO public.pw_branch_delivery_lines(delivery_id,item_id,planned_quantity) VALUES(did,(x->>'item_id')::uuid,(x->>'quantity')::numeric); END LOOP;
 INSERT INTO public.pw_audit_events(user_id,module,action,entity_id,metadata) VALUES(a,'inventory','branch_delivery_created',did::text,jsonb_build_object('destination_location_id',dest));
 RETURN jsonb_build_object('id',did,'replayed',false,'status','draft');
END;$fn$;

CREATE OR REPLACE FUNCTION public.pw_dispatch_branch_delivery_v1(p_delivery_id uuid,p_request jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE a uuid:=auth.uid(); q uuid; who text; d public.pw_branch_deliveries%ROWTYPE; l record; bal numeric; tx uuid; old public.pw_branch_deliveries%ROWTYPE;
BEGIN
 IF a IS NULL OR NOT private.pw_is_manager() THEN RAISE EXCEPTION 'Despacho reservado a administración.' USING ERRCODE='42501'; END IF; IF jsonb_typeof(p_request) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Solicitud inválida.'; END IF;
 q:=(p_request->>'request_id')::uuid;who:=left(btrim(coalesce(p_request->>'responsible','')),160);IF q IS NULL OR who='' THEN RAISE EXCEPTION 'Datos de despacho inválidos.'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(q::text,1502));SELECT * INTO old FROM public.pw_branch_deliveries WHERE dispatch_request_id=q;IF FOUND THEN IF old.id IS DISTINCT FROM p_delivery_id OR old.dispatch_notes IS DISTINCT FROM ('payload:'||md5(p_request::text)) THEN RAISE EXCEPTION 'Solicitud reutilizada para otra entrega o con cambios.'; END IF;RETURN jsonb_build_object('id',old.id,'replayed',true,'status',old.status);END IF;
 SELECT * INTO d FROM public.pw_branch_deliveries WHERE id=p_delivery_id FOR UPDATE;IF NOT FOUND OR d.status<>'draft' THEN RAISE EXCEPTION 'Sólo se despacha una entrega en borrador.'; END IF;
 FOR l IN SELECT * FROM public.pw_branch_delivery_lines WHERE delivery_id=d.id ORDER BY item_id LOOP PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('central:'||l.item_id::text,910)); SELECT coalesce(sum(quantity),0) INTO bal FROM public.pw_inventory_movements WHERE location_id='central' AND item_id=l.item_id; IF bal<l.planned_quantity THEN RAISE EXCEPTION 'Saldo insuficiente en Almacén central.'; END IF; END LOOP;
 INSERT INTO public.pw_inventory_transactions(request_id,movement_type,notes,created_by,operation_date,responsible_name,operation_reason) VALUES(q,'transfer','dispatch:'||md5(p_request::text),a,d.delivery_date,who,nullif(left(btrim(coalesce(p_request->>'notes','')),500),'')) RETURNING id INTO tx;
 FOR l IN SELECT * FROM public.pw_branch_delivery_lines WHERE delivery_id=d.id LOOP INSERT INTO public.pw_inventory_movements(transaction_id,location_id,item_id,quantity) VALUES(tx,'central',l.item_id,-l.planned_quantity),(tx,'in_transit',l.item_id,l.planned_quantity); END LOOP;
 UPDATE public.pw_branch_deliveries SET status='dispatched',dispatched_at=now(),dispatched_by=a,dispatch_responsible=who,dispatch_notes='payload:'||md5(p_request::text),dispatch_request_id=q,dispatch_transaction_id=tx WHERE id=d.id;
 INSERT INTO public.pw_audit_events(user_id,module,action,entity_id,metadata) VALUES(a,'inventory','branch_delivery_dispatched',d.id::text,jsonb_build_object('transaction_id',tx));RETURN jsonb_build_object('id',d.id,'transaction_id',tx,'replayed',false,'status','dispatched');
END;$fn$;

CREATE OR REPLACE FUNCTION public.pw_receive_branch_delivery_v1(p_delivery_id uuid,p_request jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE a uuid:=auth.uid(); v_role text; v_branch text;q uuid;who text; lines jsonb;x jsonb;l record;d public.pw_branch_deliveries%ROWTYPE;rid uuid;tx uuid;qty numeric;prior numeric;remaining numeric;total_missing numeric:=0;transit_balance numeric; old_receipt public.pw_branch_delivery_receipts%ROWTYPE;
BEGIN
 SELECT m.role,m.branch_id INTO v_role,v_branch FROM public.pw_members m WHERE m.user_id=a AND m.active;IF a IS NULL OR v_role NOT IN ('owner','consultant','employee') OR v_role IS NULL THEN RAISE EXCEPTION 'Acceso no autorizado.' USING ERRCODE='42501'; END IF; IF jsonb_typeof(p_request) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Solicitud inválida.';END IF;
 q:=(p_request->>'request_id')::uuid;who:=left(btrim(coalesce(p_request->>'responsible','')),160);lines:=p_request->'lines';IF q IS NULL OR who='' OR jsonb_typeof(lines) IS DISTINCT FROM 'array' OR jsonb_array_length(lines) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION 'Datos de recepción inválidos.';END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(q::text,1503));
 SELECT * INTO d FROM public.pw_branch_deliveries WHERE id=p_delivery_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Entrega no encontrada.'; END IF;
 IF v_role='employee' AND d.destination_location_id IS DISTINCT FROM v_branch THEN RAISE EXCEPTION 'Sucursal no autorizada.' USING ERRCODE='42501'; END IF;
 -- Reintento idempotente incluso cuando la entrega ya quedó totalmente recibida.
 SELECT * INTO old_receipt FROM public.pw_branch_delivery_receipts WHERE request_id=q;
 IF FOUND THEN
   IF old_receipt.delivery_id IS DISTINCT FROM d.id OR old_receipt.payload_hash IS DISTINCT FROM ('payload:'||md5(p_request::text)) THEN RAISE EXCEPTION 'Solicitud de recepción reutilizada con cambios.'; END IF;
   RETURN jsonb_build_object('id',p_delivery_id,'replayed',true,'status',d.status,'receipt_id',old_receipt.id);
 END IF;
 IF d.status NOT IN ('dispatched','received_with_differences') THEN RAISE EXCEPTION 'Entrega no disponible para recepción.'; END IF;
 INSERT INTO public.pw_branch_delivery_receipts(delivery_id,request_id,received_by,responsible_name,notes,payload_hash) VALUES(d.id,q,a,who,nullif(left(btrim(coalesce(p_request->>'notes','')),500),''),'payload:'||md5(p_request::text)) RETURNING id INTO rid;
 INSERT INTO public.pw_inventory_transactions(request_id,movement_type,notes,created_by,operation_date,responsible_name) VALUES(q,'transfer','receipt:'||md5(p_request::text),a,current_date,who) RETURNING id INTO tx;
 FOR x IN SELECT value FROM jsonb_array_elements(lines) LOOP SELECT * INTO l FROM public.pw_branch_delivery_lines WHERE id=(x->>'delivery_line_id')::uuid AND delivery_id=d.id;qty:=(x->>'quantity')::numeric;IF NOT FOUND OR qty IS NULL OR qty<=0 OR qty<>round(qty,3) THEN RAISE EXCEPTION 'Partida de recepción inválida.';END IF;SELECT coalesce(sum(rl.received_quantity),0) INTO prior FROM public.pw_branch_delivery_receipt_lines rl JOIN public.pw_branch_delivery_receipts r ON r.id=rl.receipt_id WHERE r.delivery_id=d.id AND rl.delivery_line_id=l.id;IF prior+qty>l.planned_quantity THEN RAISE EXCEPTION 'La recepción supera lo despachado.';END IF;PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('in_transit:'||l.item_id::text,910));
 SELECT coalesce(sum(quantity),0) INTO transit_balance FROM public.pw_inventory_movements WHERE location_id='in_transit' AND item_id=l.item_id;
 IF transit_balance < qty THEN RAISE EXCEPTION 'Saldo insuficiente de mercancía en tránsito.'; END IF;
 INSERT INTO public.pw_branch_delivery_receipt_lines(receipt_id,delivery_line_id,received_quantity) VALUES(rid,l.id,qty);INSERT INTO public.pw_inventory_movements(transaction_id,location_id,item_id,quantity) VALUES(tx,'in_transit',l.item_id,-qty),(tx,d.destination_location_id,l.item_id,qty);END LOOP;
 UPDATE public.pw_branch_delivery_receipts SET inventory_transaction_id=tx WHERE id=rid;
 FOR l IN SELECT l.id,l.planned_quantity,coalesce(sum(rl.received_quantity),0) got FROM public.pw_branch_delivery_lines l LEFT JOIN public.pw_branch_delivery_receipt_lines rl ON rl.delivery_line_id=l.id WHERE l.delivery_id=d.id GROUP BY l.id,l.planned_quantity LOOP total_missing:=total_missing+(l.planned_quantity-l.got);END LOOP;
 UPDATE public.pw_branch_deliveries SET status=CASE WHEN total_missing=0 THEN 'received' ELSE 'received_with_differences' END,received_at=now(),received_by=a WHERE id=d.id;
 INSERT INTO public.pw_audit_events(user_id,module,action,entity_id,metadata) VALUES(a,'inventory','branch_delivery_received',d.id::text,jsonb_build_object('receipt_id',rid,'transaction_id',tx,'pending_in_transit',total_missing));RETURN jsonb_build_object('id',d.id,'receipt_id',rid,'transaction_id',tx,'replayed',false,'status',CASE WHEN total_missing=0 THEN 'received' ELSE 'received_with_differences' END,'pending_in_transit',total_missing);
END;$fn$;
REVOKE ALL ON FUNCTION public.pw_create_branch_delivery_v1(jsonb),public.pw_dispatch_branch_delivery_v1(uuid,jsonb),public.pw_receive_branch_delivery_v1(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pw_create_branch_delivery_v1(jsonb),public.pw_dispatch_branch_delivery_v1(uuid,jsonb),public.pw_receive_branch_delivery_v1(uuid,jsonb) TO authenticated;
-- After the pending-delivery workflow is enabled, disable the two older direct
-- delivery endpoints from migration 14; they do not track pending/receiving states.
-- Ordinary immediate transfers from migration 12 remain available only for
-- physical handoffs and cannot touch in_transit due to the trigger above.
REVOKE EXECUTE ON FUNCTION public.pw_prepare_branch_delivery_v1(jsonb),
  public.pw_reverse_branch_delivery_v1(jsonb) FROM authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.pw_branch_deliveries,public.pw_branch_delivery_lines,public.pw_branch_delivery_receipts,public.pw_branch_delivery_receipt_lines FROM anon,authenticated;
COMMIT;
