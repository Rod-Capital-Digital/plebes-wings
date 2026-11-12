-- Plebes Wings / 09 - inventory ledger. Apply ONLY after migration 08.
-- REVIEW BEFORE PRODUCTION. Additive schema; no existing sales are touched.
BEGIN;
CREATE TABLE IF NOT EXISTS public.pw_inventory_transactions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 request_id uuid NOT NULL UNIQUE,
 movement_type text NOT NULL CHECK (movement_type IN ('opening','purchase','waste','adjustment')),
 source_id uuid,
 notes text,
 created_by uuid REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (movement_type,source_id)
);
CREATE TABLE IF NOT EXISTS public.pw_inventory_movements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 transaction_id uuid NOT NULL REFERENCES public.pw_inventory_transactions(id) ON DELETE RESTRICT,
 location_id text NOT NULL REFERENCES public.pw_stock_locations(id) ON DELETE RESTRICT,
 item_id uuid NOT NULL REFERENCES public.pw_inventory_items(id) ON DELETE RESTRICT,
 quantity numeric(14,3) NOT NULL CHECK (quantity <> 0 AND quantity = round(quantity,3)),
 unit_cost numeric(14,2) CHECK(unit_cost IS NULL OR unit_cost >= 0),
 source_line_id uuid UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (transaction_id,location_id,item_id)
);
CREATE INDEX IF NOT EXISTS pw_inventory_movements_location_item_idx ON public.pw_inventory_movements (location_id,item_id);
CREATE INDEX IF NOT EXISTS pw_inventory_movements_tx_idx ON public.pw_inventory_movements (transaction_id);
CREATE INDEX IF NOT EXISTS pw_inventory_transactions_created_at_idx ON public.pw_inventory_transactions (created_at DESC);
ALTER TABLE public.pw_inventory_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pw_inventory_movements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pw_inventory_transactions,public.pw_inventory_movements FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.pw_inventory_transactions,public.pw_inventory_movements TO authenticated;
DROP POLICY IF EXISTS pw_inventory_movements_read ON public.pw_inventory_movements;
CREATE POLICY pw_inventory_movements_read ON public.pw_inventory_movements FOR SELECT TO authenticated
 USING ((SELECT private.pw_is_manager()) OR (SELECT private.pw_can_read_branch((SELECT branch_id FROM public.pw_stock_locations WHERE id=location_id))));
DROP POLICY IF EXISTS pw_inventory_transactions_read ON public.pw_inventory_transactions;
CREATE POLICY pw_inventory_transactions_read ON public.pw_inventory_transactions FOR SELECT TO authenticated
 USING ((SELECT private.pw_is_manager()) OR EXISTS (
  SELECT 1 FROM public.pw_inventory_movements m WHERE m.transaction_id=pw_inventory_transactions.id
  AND private.pw_can_read_branch((SELECT branch_id FROM public.pw_stock_locations WHERE id=m.location_id))));
-- A new installation has zero ledger rows. Its balance is the sum of movements.
-- This view is SECURITY INVOKER: underlying RLS remains effective.
CREATE OR REPLACE VIEW public.pw_inventory_balances WITH (security_invoker=true) AS
 SELECT location_id,item_id,sum(quantity)::numeric(14,3) AS quantity
 FROM public.pw_inventory_movements GROUP BY location_id,item_id;
REVOKE ALL ON public.pw_inventory_balances FROM PUBLIC,anon;
GRANT SELECT ON public.pw_inventory_balances TO authenticated;

-- This RPC handles starting stock, waste, and authorized corrections. The same
-- request_id is safe to retry; a changed payload with a reused ID is rejected.
CREATE OR REPLACE FUNCTION public.pw_post_inventory_movement_v1(p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_user uuid:=auth.uid(); v_role text; v_branch text; v_type text; v_location text; v_item uuid;
 v_quantity numeric; v_request uuid; v_notes text; v_tx uuid; v_old public.pw_inventory_transactions%ROWTYPE;
 v_balance numeric; v_loc_branch text; v_payload_hash text;
BEGIN
 IF v_user IS NULL THEN RAISE EXCEPTION 'Se requiere una sesión.' USING ERRCODE='42501'; END IF;
 SELECT role,branch_id INTO v_role,v_branch FROM public.pw_members WHERE user_id=v_user AND active;
 IF v_role NOT IN ('owner','consultant','employee') THEN RAISE EXCEPTION 'Acceso no autorizado.' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_request) <> 'object' THEN RAISE EXCEPTION 'Solicitud inválida.'; END IF;
 v_request := (p_request->>'request_id')::uuid;
 v_type := p_request->>'movement_type'; v_location := p_request->>'location_id';
 v_item := (p_request->>'item_id')::uuid;v_quantity := (p_request->>'quantity')::numeric;
 v_notes:=left(btrim(coalesce(p_request->>'notes','')),500);
 IF v_request IS NULL OR v_type NOT IN ('opening','waste','adjustment') OR v_location IS NULL OR v_item IS NULL
 OR v_quantity IS NULL OR v_quantity=0 OR v_quantity<>round(v_quantity,3) OR abs(v_quantity)>1000000 THEN RAISE EXCEPTION 'Datos de inventario inválidos.'; END IF;
 IF v_type='opening' AND v_quantity<0 THEN RAISE EXCEPTION 'El saldo inicial debe ser positivo.'; END IF;
 IF v_type='waste' AND v_quantity>=0 THEN RAISE EXCEPTION 'Una merma debe descontar existencias.'; END IF;
 IF v_type='adjustment' AND v_role<>'owner' THEN RAISE EXCEPTION 'Solo propietario ajusta existencias.' USING ERRCODE='42501'; END IF;
 IF v_role='employee' AND v_type<>'waste' THEN RAISE EXCEPTION 'Empleado solo registra mermas autorizadas.' USING ERRCODE='42501'; END IF;
 SELECT branch_id INTO v_loc_branch FROM public.pw_stock_locations WHERE id=v_location AND active;
 IF NOT FOUND THEN RAISE EXCEPTION 'Ubicación inexistente o inactiva.'; END IF;
 IF v_role='employee' AND (v_loc_branch IS NULL OR v_loc_branch IS DISTINCT FROM v_branch) THEN
 RAISE EXCEPTION 'Sucursal no autorizada.' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.pw_inventory_items WHERE id=v_item AND active) THEN RAISE EXCEPTION 'Insumo inexistente o inactivo.'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_request::text,909));
 SELECT * INTO v_old FROM public.pw_inventory_transactions WHERE request_id=v_request;
 IF FOUND THEN
  IF v_old.notes IS DISTINCT FROM ('payload:'||md5(p_request::text)) THEN RAISE EXCEPTION 'Solicitud repetida con contenido distinto.'; END IF;
  RETURN jsonb_build_object('id',v_old.id,'replayed',true);
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_location||':'||v_item::text,910));
 SELECT coalesce(sum(quantity),0) INTO v_balance FROM public.pw_inventory_movements WHERE location_id=v_location AND item_id=v_item;
 IF v_balance+v_quantity < 0 THEN RAISE EXCEPTION 'Existencias insuficientes en esta ubicación.'; END IF;
 IF v_type='opening' AND EXISTS(SELECT 1 FROM public.pw_inventory_movements m JOIN public.pw_inventory_transactions t ON t.id=m.transaction_id WHERE m.location_id=v_location AND m.item_id=v_item) THEN
  RAISE EXCEPTION 'No puedes registrar saldo inicial sobre un artículo que ya tiene movimientos.';
 END IF;
 INSERT INTO public.pw_inventory_transactions(request_id,movement_type,notes,created_by)
 VALUES(v_request,v_type,'payload:'||md5(p_request::text),v_user) RETURNING id INTO v_tx;
 INSERT INTO public.pw_inventory_movements(transaction_id,location_id,item_id,quantity)
 VALUES(v_tx,v_location,v_item,v_quantity);
 INSERT INTO public.pw_audit_events(user_id,module,action,entity_id,metadata)
 VALUES(v_user,'inventory',v_type,v_tx::text,jsonb_build_object('location_id',v_location,'item_id',v_item,'quantity',v_quantity,'reason',v_notes));
 RETURN jsonb_build_object('id',v_tx,'replayed',false,'balance',v_balance+v_quantity);
END;$fn$;
REVOKE ALL ON FUNCTION public.pw_post_inventory_movement_v1(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pw_post_inventory_movement_v1(jsonb) TO authenticated;

-- When purchase status becomes RECEIVED, post each line exactly once, in the same
-- transaction. A failed posting rolls back the purchase reception as well.
CREATE OR REPLACE FUNCTION private.pw_post_purchase_receipt_inventory() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_tx uuid; v_line record;
BEGIN
 IF NEW.status='received' AND OLD.status IS DISTINCT FROM 'received' THEN
  INSERT INTO public.pw_inventory_transactions(request_id,movement_type,source_id,notes,created_by)
  VALUES(NEW.received_request_id,'purchase',NEW.id,'Recepción de compra '||NEW.document_code,NEW.received_by)
  RETURNING id INTO v_tx;
  FOR v_line IN SELECT id,item_id,quantity,unit_cost FROM public.pw_purchase_lines WHERE purchase_id=NEW.id LOOP
   INSERT INTO public.pw_inventory_movements(transaction_id,location_id,item_id,quantity,unit_cost,source_line_id)
   VALUES(v_tx,NEW.destination_location_id,v_line.item_id,v_line.quantity,v_line.unit_cost,v_line.id);
  END LOOP;
 END IF;
 RETURN NEW;
END;$fn$;
DROP TRIGGER IF EXISTS pw_purchase_received_inventory ON public.pw_purchase_documents;
CREATE TRIGGER pw_purchase_received_inventory AFTER UPDATE OF status ON public.pw_purchase_documents
 FOR EACH ROW EXECUTE FUNCTION private.pw_post_purchase_receipt_inventory();
COMMIT;
