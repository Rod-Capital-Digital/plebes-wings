-- REVIEW-ONLY MIGRATION: do not run against production before isolated validation.
-- Plebes Wings: purchase documents, lines and controlled state transitions.
-- Prerequisite: migration 07 operational catalogs and locations is applied.
-- This is additive. pw_purchases remains historical and is not read, altered or populated here.
BEGIN;

CREATE TABLE IF NOT EXISTS public.pw_purchase_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_code text NOT NULL,
  supplier_id uuid NOT NULL REFERENCES public.pw_suppliers(id) ON DELETE RESTRICT,
  purchase_date date NOT NULL,
  supplier_reference text,
  receipt_reference text,
  status text NOT NULL DEFAULT 'draft',
  payment_method text NOT NULL,
  destination_location_id text NOT NULL REFERENCES public.pw_stock_locations(id) ON DELETE RESTRICT,
  notes text,
  total_amount numeric(14,2) NOT NULL DEFAULT 0,
  request_id uuid NOT NULL,
  request_payload jsonb NOT NULL,
  confirmed_request_id uuid,
  confirmed_by uuid REFERENCES auth.users(id),
  confirmed_at timestamptz,
  received_request_id uuid,
  received_by uuid REFERENCES auth.users(id),
  received_at timestamptz,
  void_request_id uuid,
  voided_by uuid REFERENCES auth.users(id),
  voided_at timestamptz,
  void_reason text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pw_purchase_documents_code_not_blank CHECK (btrim(document_code) <> ''),
  CONSTRAINT pw_purchase_documents_supplier_reference_not_blank CHECK (
    supplier_reference IS NULL OR btrim(supplier_reference) <> ''
  ),
  CONSTRAINT pw_purchase_documents_receipt_reference_not_blank CHECK (
    receipt_reference IS NULL OR btrim(receipt_reference) <> ''
  ),
  CONSTRAINT pw_purchase_documents_payment_method CHECK (
    payment_method IN ('efectivo', 'tarjeta', 'transferencia', 'credito', 'otro')
  ),
  CONSTRAINT pw_purchase_documents_total_nonnegative CHECK (total_amount >= 0),
  CONSTRAINT pw_purchase_documents_status CHECK (status IN ('draft', 'confirmed', 'received', 'void')),
  CONSTRAINT pw_purchase_documents_transition CHECK (
    (status = 'draft'
      AND confirmed_request_id IS NULL AND confirmed_by IS NULL AND confirmed_at IS NULL
      AND received_request_id IS NULL AND received_by IS NULL AND received_at IS NULL
      AND void_request_id IS NULL AND voided_by IS NULL AND voided_at IS NULL AND void_reason IS NULL)
    OR
    (status = 'confirmed'
      AND confirmed_request_id IS NOT NULL AND confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL
      AND received_request_id IS NULL AND received_by IS NULL AND received_at IS NULL
      AND void_request_id IS NULL AND voided_by IS NULL AND voided_at IS NULL AND void_reason IS NULL)
    OR
    (status = 'received'
      AND confirmed_request_id IS NOT NULL AND confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL
      AND received_request_id IS NOT NULL AND received_by IS NOT NULL AND received_at IS NOT NULL
      AND void_request_id IS NULL AND voided_by IS NULL AND voided_at IS NULL AND void_reason IS NULL)
    OR
    (status = 'void'
      AND received_request_id IS NULL AND received_by IS NULL AND received_at IS NULL
      AND void_request_id IS NOT NULL AND voided_by IS NOT NULL AND voided_at IS NOT NULL
      AND nullif(btrim(void_reason), '') IS NOT NULL
      AND (
        (confirmed_request_id IS NULL AND confirmed_by IS NULL AND confirmed_at IS NULL)
        OR
        (confirmed_request_id IS NOT NULL AND confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL)
      ))
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS pw_purchase_documents_code_key
  ON public.pw_purchase_documents (document_code);
CREATE UNIQUE INDEX IF NOT EXISTS pw_purchase_documents_request_id_key
  ON public.pw_purchase_documents (request_id);
CREATE UNIQUE INDEX IF NOT EXISTS pw_purchase_documents_confirmed_request_id_key
  ON public.pw_purchase_documents (confirmed_request_id)
  WHERE confirmed_request_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS pw_purchase_documents_received_request_id_key
  ON public.pw_purchase_documents (received_request_id)
  WHERE received_request_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS pw_purchase_documents_void_request_id_key
  ON public.pw_purchase_documents (void_request_id)
  WHERE void_request_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS pw_purchase_documents_supplier_reference_active_key
  ON public.pw_purchase_documents (supplier_id, lower(btrim(supplier_reference)))
  WHERE supplier_reference IS NOT NULL AND status <> 'void';
CREATE INDEX IF NOT EXISTS pw_purchase_documents_supplier_date_idx
  ON public.pw_purchase_documents (supplier_id, purchase_date DESC);
CREATE INDEX IF NOT EXISTS pw_purchase_documents_destination_status_date_idx
  ON public.pw_purchase_documents (destination_location_id, status, purchase_date DESC);
CREATE INDEX IF NOT EXISTS pw_purchase_documents_created_by_idx
  ON public.pw_purchase_documents (created_by);

CREATE TABLE IF NOT EXISTS public.pw_purchase_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid NOT NULL REFERENCES public.pw_purchase_documents(id) ON DELETE RESTRICT,
  line_number integer NOT NULL,
  item_id uuid NOT NULL REFERENCES public.pw_inventory_items(id) ON DELETE RESTRICT,
  item_name text NOT NULL,
  unit text NOT NULL,
  quantity numeric(14,3) NOT NULL,
  unit_cost numeric(14,2) NOT NULL,
  line_total numeric(14,2) GENERATED ALWAYS AS (round(quantity * unit_cost, 2)) STORED,
  notes text,
  CONSTRAINT pw_purchase_lines_number_positive CHECK (line_number > 0),
  CONSTRAINT pw_purchase_lines_item_name_not_blank CHECK (btrim(item_name) <> ''),
  CONSTRAINT pw_purchase_lines_unit_not_blank CHECK (btrim(unit) <> ''),
  CONSTRAINT pw_purchase_lines_quantity_positive CHECK (quantity > 0),
  CONSTRAINT pw_purchase_lines_unit_cost_nonnegative CHECK (unit_cost >= 0),
  CONSTRAINT pw_purchase_lines_precision CHECK (
    quantity = round(quantity, 3) AND unit_cost = round(unit_cost, 2)
  ),
  CONSTRAINT pw_purchase_lines_purchase_line_key UNIQUE (purchase_id, line_number),
  CONSTRAINT pw_purchase_lines_purchase_item_key UNIQUE (purchase_id, item_id)
);

CREATE INDEX IF NOT EXISTS pw_purchase_lines_item_idx ON public.pw_purchase_lines (item_id);

CREATE OR REPLACE FUNCTION private.pw_set_purchase_document_audit_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF v_actor IS NOT NULL THEN NEW.created_by := v_actor; END IF;
    NEW.created_at := pg_catalog.now();
  ELSE
    NEW.created_by := OLD.created_by;
    NEW.created_at := OLD.created_at;
  END IF;
  NEW.updated_by := v_actor;
  NEW.updated_at := pg_catalog.now();
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS pw_purchase_documents_set_audit_fields ON public.pw_purchase_documents;
CREATE TRIGGER pw_purchase_documents_set_audit_fields
BEFORE INSERT OR UPDATE ON public.pw_purchase_documents
FOR EACH ROW EXECUTE FUNCTION private.pw_set_purchase_document_audit_fields();

ALTER TABLE public.pw_purchase_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pw_purchase_lines ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.pw_purchase_documents, public.pw_purchase_lines FROM anon, authenticated;
GRANT SELECT ON TABLE public.pw_purchase_documents, public.pw_purchase_lines TO authenticated;

DROP POLICY IF EXISTS pw_purchase_documents_manager_read ON public.pw_purchase_documents;
CREATE POLICY pw_purchase_documents_manager_read
ON public.pw_purchase_documents FOR SELECT TO authenticated
USING ((SELECT private.pw_is_manager()));

DROP POLICY IF EXISTS pw_purchase_documents_employee_branch_read ON public.pw_purchase_documents;
CREATE POLICY pw_purchase_documents_employee_branch_read
ON public.pw_purchase_documents FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.pw_stock_locations l
  WHERE l.id = destination_location_id
    AND l.branch_id IS NOT NULL
    AND (SELECT private.pw_can_read_branch(l.branch_id))
));

DROP POLICY IF EXISTS pw_purchase_lines_manager_read ON public.pw_purchase_lines;
CREATE POLICY pw_purchase_lines_manager_read
ON public.pw_purchase_lines FOR SELECT TO authenticated
USING ((SELECT private.pw_is_manager()));

DROP POLICY IF EXISTS pw_purchase_lines_employee_branch_read ON public.pw_purchase_lines;
CREATE POLICY pw_purchase_lines_employee_branch_read
ON public.pw_purchase_lines FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1
  FROM public.pw_purchase_documents d
  JOIN public.pw_stock_locations l ON l.id = d.destination_location_id
  WHERE d.id = purchase_id
    AND l.branch_id IS NOT NULL
    AND (SELECT private.pw_can_read_branch(l.branch_id))
));

CREATE OR REPLACE FUNCTION public.pw_create_purchase_draft_v1(p_request jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_user uuid := auth.uid();
  v_request_id uuid;
  v_existing public.pw_purchase_documents%ROWTYPE;
  v_supplier_id uuid;
  v_location_id text;
  v_purchase_date date;
  v_payment_method text;
  v_supplier_reference text;
  v_receipt_reference text;
  v_notes text;
  v_line jsonb;
  v_item_id uuid;
  v_item_name text;
  v_base_unit text;
  v_quantity numeric;
  v_unit_cost numeric;
  v_total numeric := 0;
  v_line_number integer := 0;
  v_item_ids uuid[] := ARRAY[]::uuid[];
  v_document_id uuid := pg_catalog.gen_random_uuid();
  v_document_code text;
BEGIN
  IF v_user IS NULL OR NOT private.pw_is_manager() THEN
    RAISE EXCEPTION 'No autorizado para crear compras.' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_request) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Solicitud de compra inválida.'; END IF;
  IF octet_length(p_request::text) > 50000 THEN RAISE EXCEPTION 'La solicitud de compra supera el tamaño permitido.'; END IF;
  IF coalesce(p_request->>'request_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'Identificador de solicitud inválido.';
  END IF;
  v_request_id := (p_request->>'request_id')::uuid;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_request_id::text, 2408));
  SELECT * INTO v_existing FROM public.pw_purchase_documents WHERE request_id = v_request_id;
  IF FOUND THEN
    IF v_existing.request_payload IS DISTINCT FROM p_request THEN
      RAISE EXCEPTION 'La solicitud ya fue usada con contenido diferente.';
    END IF;
    RETURN jsonb_build_object('id', v_existing.id, 'document_code', v_existing.document_code, 'status', v_existing.status, 'replayed', true);
  END IF;
  IF coalesce(p_request->>'supplier_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RAISE EXCEPTION 'Proveedor inválido.'; END IF;
  v_supplier_id := (p_request->>'supplier_id')::uuid;
  IF NOT EXISTS (SELECT 1 FROM public.pw_suppliers WHERE id = v_supplier_id AND active) THEN RAISE EXCEPTION 'Proveedor inexistente o inactivo.'; END IF;
  v_location_id := nullif(btrim(p_request->>'destination_location_id'), '');
  IF v_location_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.pw_stock_locations WHERE id = v_location_id AND active) THEN RAISE EXCEPTION 'Ubicación de destino inexistente o inactiva.'; END IF;
  IF coalesce(p_request->>'purchase_date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'Fecha de compra inválida.'; END IF;
  v_purchase_date := (p_request->>'purchase_date')::date;
  IF v_purchase_date < ((now() AT TIME ZONE 'America/Mexico_City')::date - 365) OR v_purchase_date > ((now() AT TIME ZONE 'America/Mexico_City')::date + 1) THEN RAISE EXCEPTION 'Fecha de compra fuera del periodo autorizado.'; END IF;
  v_payment_method := nullif(btrim(p_request->>'payment_method'), '');
  IF v_payment_method NOT IN ('efectivo','tarjeta','transferencia','credito','otro') THEN RAISE EXCEPTION 'Método de pago inválido.'; END IF;
  IF jsonb_typeof(p_request->'lines') IS DISTINCT FROM 'array' OR jsonb_array_length(p_request->'lines') NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'La compra requiere entre 1 y 100 partidas.'; END IF;
  v_supplier_reference := nullif(left(btrim(coalesce(p_request->>'supplier_reference','')), 120), '');
  v_receipt_reference := nullif(left(btrim(coalesce(p_request->>'receipt_reference','')), 180), '');
  v_notes := nullif(left(btrim(coalesce(p_request->>'notes','')), 800), '');
  v_document_code := 'PW-COMP-' || to_char(v_purchase_date, 'YYYYMMDD') || '-' || replace(v_document_id::text, '-', '');
  INSERT INTO public.pw_purchase_documents (
    id, document_code, supplier_id, purchase_date, supplier_reference, receipt_reference,
    status, payment_method, destination_location_id, notes, request_id, request_payload, created_by
  ) VALUES (
    v_document_id, v_document_code, v_supplier_id, v_purchase_date, v_supplier_reference, v_receipt_reference,
    'draft', v_payment_method, v_location_id, v_notes, v_request_id, p_request, v_user
  );
  FOR v_line IN SELECT value FROM jsonb_array_elements(p_request->'lines') LOOP
    IF jsonb_typeof(v_line) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Partida de compra inválida.'; END IF;
    IF coalesce(v_line->>'item_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RAISE EXCEPTION 'Insumo inválido.'; END IF;
    v_item_id := (v_line->>'item_id')::uuid;
    IF v_item_id = ANY(v_item_ids) THEN RAISE EXCEPTION 'Un insumo no puede repetirse en la misma compra.'; END IF;
    IF jsonb_typeof(v_line->'quantity') IS DISTINCT FROM 'number' OR jsonb_typeof(v_line->'unit_cost') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Cantidad o costo inválido.'; END IF;
    v_quantity := (v_line->>'quantity')::numeric;
    v_unit_cost := (v_line->>'unit_cost')::numeric;
    IF v_quantity <= 0 OR v_quantity <> round(v_quantity, 3) OR v_unit_cost < 0 OR v_unit_cost <> round(v_unit_cost, 2) THEN RAISE EXCEPTION 'Cantidad o costo fuera de precisión permitida.'; END IF;
    SELECT name, base_unit INTO v_item_name, v_base_unit FROM public.pw_inventory_items WHERE id = v_item_id AND active FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Insumo inexistente o inactivo.'; END IF;
    IF lower(btrim(coalesce(v_line->>'unit',''))) <> lower(btrim(v_base_unit)) THEN RAISE EXCEPTION 'La unidad de la partida no coincide con la unidad base del insumo.'; END IF;
    v_line_number := v_line_number + 1;
    INSERT INTO public.pw_purchase_lines (purchase_id, line_number, item_id, item_name, unit, quantity, unit_cost, notes)
    VALUES (v_document_id, v_line_number, v_item_id, v_item_name, v_base_unit, v_quantity, v_unit_cost, nullif(left(btrim(coalesce(v_line->>'notes','')), 400), ''));
    v_total := v_total + round(v_quantity * v_unit_cost, 2);
    v_item_ids := array_append(v_item_ids, v_item_id);
  END LOOP;
  UPDATE public.pw_purchase_documents SET total_amount = round(v_total, 2) WHERE id = v_document_id;
  INSERT INTO public.pw_audit_events(user_id, module, action, entity_id, metadata)
  VALUES (v_user, 'purchases', 'purchase_draft_created', v_document_id::text, jsonb_build_object('document_code', v_document_code, 'destination_location_id', v_location_id));
  RETURN jsonb_build_object('id', v_document_id, 'document_code', v_document_code, 'status', 'draft', 'replayed', false);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.pw_confirm_purchase_v1(p_purchase_id uuid, p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_user uuid := auth.uid();
  v_document public.pw_purchase_documents%ROWTYPE;
  v_total numeric;
BEGIN
  IF v_user IS NULL OR NOT private.pw_is_manager() THEN RAISE EXCEPTION 'No autorizado para confirmar compras.' USING ERRCODE = '42501'; END IF;
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'Identificador de confirmación inválido.'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text, 2409));
  SELECT * INTO v_document FROM public.pw_purchase_documents WHERE id = p_purchase_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Compra inexistente.'; END IF;
  IF v_document.status = 'confirmed' AND v_document.confirmed_request_id = p_request_id THEN RETURN jsonb_build_object('id', v_document.id, 'document_code', v_document.document_code, 'status', 'confirmed', 'replayed', true); END IF;
  IF v_document.status <> 'draft' THEN RAISE EXCEPTION 'Solo una compra en borrador puede confirmarse.'; END IF;
  SELECT coalesce(sum(line_total), 0) INTO v_total FROM public.pw_purchase_lines WHERE purchase_id = v_document.id;
  IF v_total <> v_document.total_amount OR NOT EXISTS (SELECT 1 FROM public.pw_purchase_lines WHERE purchase_id = v_document.id) THEN RAISE EXCEPTION 'Las partidas no coinciden con el total de la compra.'; END IF;
  UPDATE public.pw_purchase_documents SET status = 'confirmed', confirmed_request_id = p_request_id, confirmed_by = v_user, confirmed_at = now() WHERE id = v_document.id AND status = 'draft';
  INSERT INTO public.pw_audit_events(user_id, module, action, entity_id, metadata) VALUES (v_user, 'purchases', 'purchase_confirmed', v_document.id::text, jsonb_build_object('document_code', v_document.document_code));
  RETURN jsonb_build_object('id', v_document.id, 'document_code', v_document.document_code, 'status', 'confirmed', 'replayed', false);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.pw_receive_purchase_v1(p_purchase_id uuid, p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_user uuid := auth.uid(); v_role text; v_branch_id text;
  v_document public.pw_purchase_documents%ROWTYPE; v_destination_branch text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Autenticación requerida.' USING ERRCODE = '42501'; END IF;
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'Identificador de recepción inválido.'; END IF;
  SELECT role, branch_id INTO v_role, v_branch_id FROM public.pw_members WHERE user_id = v_user AND active FOR SHARE;
  IF NOT FOUND OR v_role NOT IN ('owner','consultant','employee') THEN RAISE EXCEPTION 'Membresía activa no autorizada.' USING ERRCODE = '42501'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text, 2410));
  SELECT * INTO v_document FROM public.pw_purchase_documents WHERE id = p_purchase_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Compra inexistente.'; END IF;
  SELECT branch_id INTO v_destination_branch FROM public.pw_stock_locations WHERE id = v_document.destination_location_id;
  IF v_role = 'employee' AND (v_destination_branch IS NULL OR v_destination_branch IS DISTINCT FROM v_branch_id) THEN RAISE EXCEPTION 'La compra no corresponde a tu sucursal.' USING ERRCODE = '42501'; END IF;
  IF v_document.status = 'received' AND v_document.received_request_id = p_request_id THEN RETURN jsonb_build_object('id', v_document.id, 'document_code', v_document.document_code, 'status', 'received', 'replayed', true); END IF;
  IF v_document.status <> 'confirmed' THEN RAISE EXCEPTION 'Solo una compra confirmada puede recibirse.'; END IF;
  UPDATE public.pw_purchase_documents SET status = 'received', received_request_id = p_request_id, received_by = v_user, received_at = now() WHERE id = v_document.id AND status = 'confirmed';
  -- Deliberately no inventory movement here. Migration 09 will atomically post receipt movements.
  INSERT INTO public.pw_audit_events(user_id, module, action, entity_id, metadata) VALUES (v_user, 'purchases', 'purchase_received_pending_inventory', v_document.id::text, jsonb_build_object('document_code', v_document.document_code, 'destination_location_id', v_document.destination_location_id));
  RETURN jsonb_build_object('id', v_document.id, 'document_code', v_document.document_code, 'status', 'received', 'replayed', false);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.pw_void_purchase_v1(p_purchase_id uuid, p_request_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_user uuid := auth.uid(); v_document public.pw_purchase_documents%ROWTYPE; v_reason text;
BEGIN
  IF v_user IS NULL OR NOT private.pw_is_owner() THEN RAISE EXCEPTION 'No autorizado para anular compras.' USING ERRCODE = '42501'; END IF;
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'Identificador de anulación inválido.'; END IF;
  v_reason := nullif(left(btrim(coalesce(p_reason, '')), 400), '');
  IF v_reason IS NULL THEN RAISE EXCEPTION 'El motivo de anulación es obligatorio.'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text, 2411));
  SELECT * INTO v_document FROM public.pw_purchase_documents WHERE id = p_purchase_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Compra inexistente.'; END IF;
  IF v_document.status = 'void' AND v_document.void_request_id = p_request_id THEN RETURN jsonb_build_object('id', v_document.id, 'document_code', v_document.document_code, 'status', 'void', 'replayed', true); END IF;
  IF v_document.status NOT IN ('draft', 'confirmed') THEN RAISE EXCEPTION 'Una compra recibida no puede anularse; requiere una rectificación posterior.'; END IF;
  UPDATE public.pw_purchase_documents SET status = 'void', void_request_id = p_request_id, voided_by = v_user, voided_at = now(), void_reason = v_reason WHERE id = v_document.id AND status IN ('draft', 'confirmed');
  INSERT INTO public.pw_audit_events(user_id, module, action, entity_id, metadata) VALUES (v_user, 'purchases', 'purchase_voided', v_document.id::text, jsonb_build_object('document_code', v_document.document_code, 'reason', v_reason));
  RETURN jsonb_build_object('id', v_document.id, 'document_code', v_document.document_code, 'status', 'void', 'replayed', false);
END;
$fn$;

REVOKE ALL ON FUNCTION public.pw_create_purchase_draft_v1(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pw_confirm_purchase_v1(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pw_receive_purchase_v1(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pw_void_purchase_v1(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pw_create_purchase_draft_v1(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pw_confirm_purchase_v1(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pw_receive_purchase_v1(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pw_void_purchase_v1(uuid, uuid, text) TO authenticated;

COMMIT;
