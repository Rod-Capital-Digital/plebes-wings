-- REVIEW-ONLY MIGRATION: do not run against production before isolated validation.
-- Plebes Wings: supplier-item associations and atomic, idempotent partial receipts.
-- Prerequisites: migrations 07, 08 and 09. This preserves purchase documents and
-- their historical lines; it replaces only the future purchase-receipt posting path.
BEGIN;

CREATE TABLE IF NOT EXISTS public.pw_supplier_inventory_items (
  supplier_id uuid NOT NULL REFERENCES public.pw_suppliers(id) ON DELETE RESTRICT,
  item_id uuid NOT NULL REFERENCES public.pw_inventory_items(id) ON DELETE RESTRICT,
  supplier_item_code text,
  preferred boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (supplier_id, item_id),
  CONSTRAINT pw_supplier_inventory_items_code_not_blank CHECK (supplier_item_code IS NULL OR btrim(supplier_item_code) <> '')
);
CREATE UNIQUE INDEX IF NOT EXISTS pw_supplier_inventory_items_one_preferred_item
  ON public.pw_supplier_inventory_items(item_id) WHERE preferred AND active;
CREATE INDEX IF NOT EXISTS pw_supplier_inventory_items_supplier_idx
  ON public.pw_supplier_inventory_items(supplier_id, active);

CREATE TABLE IF NOT EXISTS public.pw_purchase_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid NOT NULL REFERENCES public.pw_purchase_documents(id) ON DELETE RESTRICT,
  request_id uuid NOT NULL UNIQUE,
  payload_hash text NOT NULL,
  notes text,
  received_by uuid NOT NULL REFERENCES auth.users(id),
  received_at timestamptz NOT NULL DEFAULT now(),
  inventory_transaction_id uuid NOT NULL UNIQUE REFERENCES public.pw_inventory_transactions(id) ON DELETE RESTRICT,
  CONSTRAINT pw_purchase_receipts_notes_not_blank CHECK (notes IS NULL OR btrim(notes) <> '')
);
CREATE TABLE IF NOT EXISTS public.pw_purchase_receipt_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id uuid NOT NULL REFERENCES public.pw_purchase_receipts(id) ON DELETE RESTRICT,
  purchase_line_id uuid NOT NULL REFERENCES public.pw_purchase_lines(id) ON DELETE RESTRICT,
  received_quantity numeric(14,3) NOT NULL,
  CONSTRAINT pw_purchase_receipt_lines_unique_pair UNIQUE (receipt_id, purchase_line_id),
  CONSTRAINT pw_purchase_receipt_lines_quantity_positive CHECK (received_quantity > 0 AND received_quantity = round(received_quantity, 3))
);
CREATE INDEX IF NOT EXISTS pw_purchase_receipts_purchase_date_idx ON public.pw_purchase_receipts(purchase_id, received_at DESC);
CREATE INDEX IF NOT EXISTS pw_purchase_receipt_lines_purchase_line_idx ON public.pw_purchase_receipt_lines(purchase_line_id);

ALTER TABLE public.pw_purchase_documents DROP CONSTRAINT IF EXISTS pw_purchase_documents_status;
ALTER TABLE public.pw_purchase_documents ADD CONSTRAINT pw_purchase_documents_status
  CHECK (status IN ('draft', 'confirmed', 'partially_received', 'received', 'void'));
ALTER TABLE public.pw_purchase_documents DROP CONSTRAINT IF EXISTS pw_purchase_documents_transition;
ALTER TABLE public.pw_purchase_documents ADD CONSTRAINT pw_purchase_documents_transition CHECK (
  (status = 'draft' AND confirmed_request_id IS NULL AND confirmed_by IS NULL AND confirmed_at IS NULL
    AND received_request_id IS NULL AND received_by IS NULL AND received_at IS NULL
    AND void_request_id IS NULL AND voided_by IS NULL AND voided_at IS NULL AND void_reason IS NULL)
  OR (status IN ('confirmed', 'partially_received') AND confirmed_request_id IS NOT NULL AND confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL
    AND received_request_id IS NULL AND received_by IS NULL AND received_at IS NULL
    AND void_request_id IS NULL AND voided_by IS NULL AND voided_at IS NULL AND void_reason IS NULL)
  OR (status = 'received' AND confirmed_request_id IS NOT NULL AND confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL
    AND received_request_id IS NOT NULL AND received_by IS NOT NULL AND received_at IS NOT NULL
    AND void_request_id IS NULL AND voided_by IS NULL AND voided_at IS NULL AND void_reason IS NULL)
  OR (status = 'void' AND received_request_id IS NULL AND received_by IS NULL AND received_at IS NULL
    AND void_request_id IS NOT NULL AND voided_by IS NOT NULL AND voided_at IS NOT NULL AND nullif(btrim(void_reason), '') IS NOT NULL
    AND ((confirmed_request_id IS NULL AND confirmed_by IS NULL AND confirmed_at IS NULL)
      OR (confirmed_request_id IS NOT NULL AND confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL)))
);

ALTER TABLE public.pw_supplier_inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pw_purchase_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pw_purchase_receipt_lines ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pw_supplier_inventory_items, public.pw_purchase_receipts, public.pw_purchase_receipt_lines FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.pw_supplier_inventory_items, public.pw_purchase_receipts, public.pw_purchase_receipt_lines TO authenticated;
DROP POLICY IF EXISTS pw_supplier_inventory_items_manager_read ON public.pw_supplier_inventory_items;
CREATE POLICY pw_supplier_inventory_items_manager_read ON public.pw_supplier_inventory_items FOR SELECT TO authenticated USING ((SELECT private.pw_is_manager()));
DROP POLICY IF EXISTS pw_purchase_receipts_read ON public.pw_purchase_receipts;
CREATE POLICY pw_purchase_receipts_read ON public.pw_purchase_receipts FOR SELECT TO authenticated USING (
  (SELECT private.pw_is_manager()) OR EXISTS (
    SELECT 1 FROM public.pw_purchase_documents d JOIN public.pw_stock_locations l ON l.id=d.destination_location_id
    WHERE d.id=purchase_id AND l.branch_id IS NOT NULL AND (SELECT private.pw_can_read_branch(l.branch_id))
  )
);
DROP POLICY IF EXISTS pw_purchase_receipt_lines_read ON public.pw_purchase_receipt_lines;
CREATE POLICY pw_purchase_receipt_lines_read ON public.pw_purchase_receipt_lines FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.pw_purchase_receipts r WHERE r.id=receipt_id)
);

CREATE OR REPLACE FUNCTION public.pw_set_supplier_inventory_item_v1(p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE a uuid:=auth.uid(); s uuid; i uuid; c text; p boolean; active_value boolean;
BEGIN
  IF a IS NULL OR NOT private.pw_is_manager() THEN RAISE EXCEPTION 'No autorizado para relacionar proveedores e insumos.' USING ERRCODE='42501'; END IF;
  IF jsonb_typeof(p_request) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Solicitud de relación inválida.'; END IF;
  s:=(p_request->>'supplier_id')::uuid; i:=(p_request->>'item_id')::uuid; c:=nullif(left(btrim(coalesce(p_request->>'supplier_item_code','')),120),'');
  p:=coalesce((p_request->>'preferred')::boolean,false); active_value:=coalesce((p_request->>'active')::boolean,true);
  IF s IS NULL OR i IS NULL OR NOT EXISTS (SELECT 1 FROM public.pw_suppliers WHERE id=s AND active) OR NOT EXISTS (SELECT 1 FROM public.pw_inventory_items WHERE id=i AND active) THEN RAISE EXCEPTION 'Proveedor o insumo activo inválido.'; END IF;
  IF p AND active_value THEN UPDATE public.pw_supplier_inventory_items SET preferred=false,updated_by=a,updated_at=now() WHERE item_id=i AND preferred AND active; END IF;
  INSERT INTO public.pw_supplier_inventory_items(supplier_id,item_id,supplier_item_code,preferred,active,created_by,updated_by)
  VALUES(s,i,c,p,active_value,a,a)
  ON CONFLICT(supplier_id,item_id) DO UPDATE SET supplier_item_code=EXCLUDED.supplier_item_code,preferred=EXCLUDED.preferred,active=EXCLUDED.active,updated_by=a,updated_at=now();
  INSERT INTO public.pw_audit_events(user_id,module,action,entity_id,metadata) VALUES(a,'purchases','supplier_item_linked',s::text,jsonb_build_object('item_id',i,'preferred',p,'active',active_value));
  RETURN jsonb_build_object('supplier_id',s,'item_id',i,'preferred',p,'active',active_value);
END;$fn$;

-- Migration 09 posts all planned lines when a document changes to received.
-- Partial reception posts only accepted quantities below, so disable that legacy trigger.
DROP TRIGGER IF EXISTS pw_purchase_received_inventory ON public.pw_purchase_documents;

CREATE OR REPLACE FUNCTION public.pw_receive_purchase_partial_v1(p_purchase_id uuid, p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE a uuid:=auth.uid(); role_value text; member_branch text; destination_branch text; d public.pw_purchase_documents%ROWTYPE;
  q uuid; lines jsonb; x jsonb; v_receipt_id uuid; tx uuid; prior numeric; remaining numeric; qty numeric; line_row public.pw_purchase_lines%ROWTYPE;
  receipt_line_id uuid; any_remaining boolean; old public.pw_purchase_receipts%ROWTYPE; request_hash text; notes_value text; final_status text;
BEGIN
  IF a IS NULL THEN RAISE EXCEPTION 'Autenticación requerida.' USING ERRCODE='42501'; END IF;
  SELECT role,branch_id INTO role_value,member_branch FROM public.pw_members WHERE user_id=a AND active FOR SHARE;
  IF role_value NOT IN ('owner','consultant','employee') THEN RAISE EXCEPTION 'Membresía activa no autorizada.' USING ERRCODE='42501'; END IF;
  IF jsonb_typeof(p_request) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Solicitud de recepción inválida.'; END IF;
  q:=(p_request->>'request_id')::uuid; lines:=p_request->'lines'; notes_value:=nullif(left(btrim(coalesce(p_request->>'notes','')),800),''); request_hash:='payload:'||md5(p_request::text);
  IF q IS NULL OR jsonb_typeof(lines) IS DISTINCT FROM 'array' OR jsonb_array_length(lines) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Datos de recepción inválidos.'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(q::text,1701));
  SELECT * INTO old FROM public.pw_purchase_receipts WHERE request_id=q;
  IF FOUND THEN
    IF old.purchase_id IS DISTINCT FROM p_purchase_id OR old.payload_hash IS DISTINCT FROM request_hash THEN RAISE EXCEPTION 'Solicitud de recepción reutilizada con cambios.'; END IF;
    -- Los reintentos solo pueden leer compras visibles para el mismo usuario.
    IF NOT private.pw_is_manager() AND NOT EXISTS (SELECT 1 FROM public.pw_purchase_documents pd JOIN public.pw_stock_locations sl ON sl.id=pd.destination_location_id WHERE pd.id=old.purchase_id AND sl.branch_id=member_branch) THEN RAISE EXCEPTION 'Recepción no autorizada.' USING ERRCODE='42501'; END IF;
    SELECT status INTO final_status FROM public.pw_purchase_documents WHERE id=old.purchase_id;
    RETURN jsonb_build_object('id',old.purchase_id,'receipt_id',old.id,'transaction_id',old.inventory_transaction_id,'status',final_status,'replayed',true);
  END IF;
  SELECT * INTO d FROM public.pw_purchase_documents WHERE id=p_purchase_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Compra inexistente.'; END IF;
  SELECT branch_id INTO destination_branch FROM public.pw_stock_locations WHERE id=d.destination_location_id;
  IF role_value='employee' AND (destination_branch IS NULL OR destination_branch IS DISTINCT FROM member_branch) THEN RAISE EXCEPTION 'La compra no corresponde a tu sucursal.' USING ERRCODE='42501'; END IF;
  IF d.status NOT IN ('confirmed','partially_received') THEN RAISE EXCEPTION 'Solo una compra confirmada o parcialmente recibida puede recibirse.'; END IF;
  INSERT INTO public.pw_inventory_transactions(request_id,movement_type,source_id,notes,created_by)
  VALUES(q,'purchase',q,request_hash,a) RETURNING id INTO tx;
  INSERT INTO public.pw_purchase_receipts(purchase_id,request_id,payload_hash,notes,received_by,inventory_transaction_id)
  VALUES(d.id,q,request_hash,notes_value,a,tx) RETURNING id INTO v_receipt_id;
  FOR x IN SELECT value FROM jsonb_array_elements(lines) LOOP
    IF jsonb_typeof(x) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Partida de recepción inválida.'; END IF;
    qty:=(x->>'quantity')::numeric;
    SELECT * INTO line_row FROM public.pw_purchase_lines WHERE id=(x->>'purchase_line_id')::uuid AND purchase_id=d.id FOR SHARE;
    IF NOT FOUND OR qty IS NULL OR qty<=0 OR qty>1000000 OR qty<>round(qty,3) THEN RAISE EXCEPTION 'Partida de recepción inválida.'; END IF;
    IF EXISTS (SELECT 1 FROM public.pw_purchase_receipt_lines prl WHERE prl.receipt_id=v_receipt_id AND prl.purchase_line_id=line_row.id) THEN RAISE EXCEPTION 'Una partida no puede repetirse en la misma recepción.'; END IF;
    SELECT coalesce(sum(rl.received_quantity),0) INTO prior FROM public.pw_purchase_receipt_lines rl JOIN public.pw_purchase_receipts r ON r.id=rl.receipt_id WHERE r.purchase_id=d.id AND rl.purchase_line_id=line_row.id;
    remaining:=line_row.quantity-prior;
    IF qty>remaining THEN RAISE EXCEPTION 'La recepción supera la cantidad pendiente de la partida.'; END IF;
    INSERT INTO public.pw_purchase_receipt_lines(receipt_id,purchase_line_id,received_quantity) VALUES(v_receipt_id,line_row.id,qty) RETURNING id INTO receipt_line_id;
    INSERT INTO public.pw_inventory_movements(transaction_id,location_id,item_id,quantity,unit_cost,source_line_id)
    VALUES(tx,d.destination_location_id,line_row.item_id,qty,line_row.unit_cost,receipt_line_id);
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM public.pw_purchase_receipt_lines prl WHERE prl.receipt_id=v_receipt_id) THEN RAISE EXCEPTION 'La recepción requiere al menos una partida.'; END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.pw_purchase_lines pl WHERE pl.purchase_id=d.id AND pl.quantity > coalesce((
      SELECT sum(rl.received_quantity) FROM public.pw_purchase_receipt_lines rl JOIN public.pw_purchase_receipts r ON r.id=rl.receipt_id WHERE r.purchase_id=d.id AND rl.purchase_line_id=pl.id
    ),0)
  ) INTO any_remaining;
  final_status:=CASE WHEN any_remaining THEN 'partially_received' ELSE 'received' END;
  UPDATE public.pw_purchase_documents SET status=final_status,
    received_request_id=CASE WHEN final_status='received' THEN q ELSE NULL END,
    received_by=CASE WHEN final_status='received' THEN a ELSE NULL END,
    received_at=CASE WHEN final_status='received' THEN now() ELSE NULL END
  WHERE id=d.id;
  INSERT INTO public.pw_audit_events(user_id,module,action,entity_id,metadata)
  VALUES(a,'purchases','purchase_received',d.id::text,jsonb_build_object('receipt_id',v_receipt_id,'transaction_id',tx,'status',final_status));
  RETURN jsonb_build_object('id',d.id,'receipt_id',v_receipt_id,'transaction_id',tx,'status',final_status,'replayed',false);
END;$fn$;

-- Preserve the original full-receipt endpoint for older clients. It delegates to
-- the partial engine with every outstanding line and cannot double-post inventory.
CREATE OR REPLACE FUNCTION public.pw_receive_purchase_v1(p_purchase_id uuid, p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE p jsonb; d public.pw_purchase_documents%ROWTYPE;
BEGIN
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'Identificador de recepción inválido.'; END IF;
  IF auth.uid() IS NULL OR (NOT private.pw_is_manager() AND NOT EXISTS (
    SELECT 1 FROM public.pw_purchase_documents pd JOIN public.pw_stock_locations sl ON sl.id=pd.destination_location_id
    JOIN public.pw_members m ON m.user_id=auth.uid() AND m.active AND m.role='employee' AND m.branch_id=sl.branch_id
    WHERE pd.id=p_purchase_id
  )) THEN RAISE EXCEPTION 'Recepción no autorizada.' USING ERRCODE='42501'; END IF;
  SELECT * INTO d FROM public.pw_purchase_documents WHERE id=p_purchase_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Compra inexistente.'; END IF;
  IF (d.status='received' AND d.received_request_id=p_request_id) OR EXISTS (SELECT 1 FROM public.pw_purchase_receipts r WHERE r.request_id=p_request_id AND r.purchase_id=p_purchase_id) THEN
    -- Reusing the same request remains safe after a previous confirmed receipt.
    RETURN jsonb_build_object('id',d.id,'document_code',d.document_code,'status',d.status,'replayed',true);
  END IF;
  SELECT jsonb_build_object('request_id',p_request_id,'lines',coalesce(jsonb_agg(jsonb_build_object('purchase_line_id',pl.id,'quantity',pl.quantity-coalesce(got.quantity,0)) ORDER BY pl.line_number),'[]'::jsonb))
  INTO p FROM public.pw_purchase_lines pl
  LEFT JOIN LATERAL (SELECT sum(rl.received_quantity) quantity FROM public.pw_purchase_receipt_lines rl JOIN public.pw_purchase_receipts r ON r.id=rl.receipt_id WHERE r.purchase_id=p_purchase_id AND rl.purchase_line_id=pl.id) got ON true
  WHERE pl.purchase_id=p_purchase_id AND pl.quantity>coalesce(got.quantity,0);
  RETURN public.pw_receive_purchase_partial_v1(p_purchase_id,p);
END;$fn$;

REVOKE ALL ON FUNCTION public.pw_set_supplier_inventory_item_v1(jsonb), public.pw_receive_purchase_partial_v1(uuid,jsonb), public.pw_receive_purchase_v1(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pw_set_supplier_inventory_item_v1(jsonb), public.pw_receive_purchase_partial_v1(uuid,jsonb), public.pw_receive_purchase_v1(uuid,uuid) TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.pw_supplier_inventory_items, public.pw_purchase_receipts, public.pw_purchase_receipt_lines FROM anon, authenticated;
COMMIT;
