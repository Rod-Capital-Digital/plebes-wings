-- REVIEW-ONLY MIGRATION: do not run against production before the security review.
-- Plebes Wings V3: employee sales, branch isolation and auditable sale voiding.
-- Target: plebes-wings-prod / rilrfcmmylldftioapnc
-- THIS FILE HAS NOT BEEN APPLIED TO PRODUCTION. Review and test in staging first.
-- PostgreSQL transactions ensure the policy cutover is all-or-nothing.
BEGIN;

ALTER TABLE public.pw_sales
  ADD COLUMN IF NOT EXISTS voided_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS voided_at timestamptz,
  ADD COLUMN IF NOT EXISTS void_legacy boolean NOT NULL DEFAULT false;

-- Historical voids predate the audit fields. Label them explicitly instead of
-- inventing an actor or a cancellation timestamp. Existing data is retained.
UPDATE public.pw_sales
SET void_legacy = true
WHERE status = 'void' AND voided_by IS NULL AND voided_at IS NULL
  AND void_legacy = false;

ALTER TABLE public.pw_sales DROP CONSTRAINT IF EXISTS pw_sales_void_actor;
ALTER TABLE public.pw_sales ADD CONSTRAINT pw_sales_void_actor CHECK (
  (status = 'active' AND voided_by IS NULL AND voided_at IS NULL AND NOT void_legacy) OR
  (status = 'void' AND (
    (void_legacy AND voided_by IS NULL AND voided_at IS NULL) OR
    (NOT void_legacy AND voided_by IS NOT NULL AND voided_at IS NOT NULL)
  ))
);
CREATE INDEX IF NOT EXISTS pw_sales_branch_status_date_idx
  ON public.pw_sales (branch_id, status, sale_date DESC);

-- Existing private.pw_is_manager() and pw_members membership checks are
-- reused; do not introduce callable role-lookup helpers with arbitrary user IDs.
-- Employee branch membership cannot be edited by an employee via RLS.
-- The only public write route for a sale. It accepts an authenticated employee
-- only for the branch assigned in pw_members; prices and totals come from DB.
CREATE OR REPLACE FUNCTION public.pw_register_sale_v2(p_request jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_user uuid := auth.uid(); v_role text; v_assigned_branch text;
  v_request_id uuid; v_existing public.pw_sales%ROWTYPE;
  v_branch text; v_sale_date date; v_item jsonb; v_payment jsonb;
  v_product text; v_quantity integer; v_price numeric; v_method text; v_amount numeric;
  v_total numeric := 0; v_paid numeric := 0; v_sale_id uuid; v_ticket text;
  v_products text[] := ARRAY[]::text[]; v_quantities integer[] := ARRAY[]::integer[];
  v_prices numeric[] := ARRAY[]::numeric[]; v_methods text[] := ARRAY[]::text[];
  v_amounts numeric[] := ARRAY[]::numeric[]; v_ref text; v_note text; v_i integer;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Autenticacion requerida.' USING ERRCODE = '42501'; END IF;
  SELECT role, branch_id INTO v_role, v_assigned_branch
    FROM public.pw_members WHERE user_id = v_user AND active FOR SHARE;
  IF NOT FOUND OR v_role NOT IN ('owner','consultant','employee') THEN
    RAISE EXCEPTION 'Membresia activa no autorizada.' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_request) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Solicitud de venta invalida.';
  END IF;
  IF coalesce(p_request->>'request_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'Identificador de solicitud invalido.';
  END IF;
  v_request_id := (p_request->>'request_id')::uuid;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_request_id::text, 1739));
  SELECT * INTO v_existing FROM public.pw_sales WHERE request_id = v_request_id;
  IF FOUND THEN
    -- SECURITY DEFINER can see cross-branch rows, so the replay path must
    -- validate ownership before returning any data from the existing sale.
    IF v_existing.created_by IS DISTINCT FROM v_user OR
       (v_role = 'employee' AND v_existing.branch_id IS DISTINCT FROM v_assigned_branch) THEN
      RAISE EXCEPTION 'No autorizado para consultar esta solicitud.' USING ERRCODE = '42501';
    END IF;
    IF v_existing.request_payload IS DISTINCT FROM p_request THEN
      RAISE EXCEPTION 'La solicitud ya se uso con contenido diferente.';
    END IF;
    SELECT coalesce(sum(line_total),0) INTO v_total FROM public.pw_sale_lines WHERE sale_id = v_existing.id;
    RETURN pg_catalog.jsonb_build_object('id',v_existing.id,'ticket',v_existing.ticket,'total',v_total,'branch_id',v_existing.branch_id,'replayed',true);
  END IF;
  v_branch := nullif(btrim(p_request->>'branch_id'),'');
  IF v_branch IS NULL OR NOT EXISTS (SELECT 1 FROM public.pw_branches WHERE id=v_branch AND active) THEN
    RAISE EXCEPTION 'Sucursal inexistente o inactiva.';
  END IF;
  IF v_role = 'employee' AND v_branch IS DISTINCT FROM v_assigned_branch THEN
    RAISE EXCEPTION 'La sucursal solicitada no corresponde a tu membresia.' USING ERRCODE = '42501';
  END IF;
  IF coalesce(p_request->>'date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'Fecha de venta invalida.'; END IF;
  v_sale_date := (p_request->>'date')::date;
  IF v_sale_date < ((now() AT TIME ZONE 'America/Mexico_City')::date - 30)
     OR v_sale_date > ((now() AT TIME ZONE 'America/Mexico_City')::date + 1) THEN RAISE EXCEPTION 'Fecha fuera del periodo autorizado.'; END IF;
  IF jsonb_typeof(p_request->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(p_request->'items') NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION 'La venta requiere entre 1 y 80 partidas.'; END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_request->'items') LOOP
    IF jsonb_typeof(v_item) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Partida invalida.'; END IF;
    v_product := nullif(v_item->>'product_id','');
    IF v_product IS NULL OR v_product = ANY(v_products) THEN RAISE EXCEPTION 'Producto inexistente o duplicado.'; END IF;
    IF jsonb_typeof(v_item->'quantity') IS DISTINCT FROM 'number' OR coalesce(v_item->>'quantity','') !~ '^[1-9][0-9]{0,2}$' THEN RAISE EXCEPTION 'Cantidad invalida.'; END IF;
    v_quantity := (v_item->>'quantity')::integer;
    SELECT sale_price INTO v_price FROM public.pw_products WHERE id=v_product AND active FOR SHARE;
    IF NOT FOUND OR v_price IS NULL OR v_price <= 0 OR v_price > 1000000 OR v_price <> round(v_price,2) THEN RAISE EXCEPTION 'Producto sin precio oficial valido.'; END IF;
    IF jsonb_typeof(v_item->'quoted_unit_price') IS DISTINCT FROM 'number' OR (v_item->>'quoted_unit_price')::numeric <> v_price THEN RAISE EXCEPTION 'El precio cambio; consulta nuevamente el catalogo.'; END IF;
    v_total := v_total + v_price * v_quantity;
    v_products := array_append(v_products,v_product); v_quantities := array_append(v_quantities,v_quantity); v_prices := array_append(v_prices,v_price);
  END LOOP;
  v_total := round(v_total,2);
  IF v_total <= 0 OR v_total > 10000000 OR jsonb_typeof(p_request->'quoted_total') IS DISTINCT FROM 'number' OR (p_request->>'quoted_total')::numeric <> v_total THEN RAISE EXCEPTION 'El importe no coincide con el calculo del servidor.'; END IF;
  IF jsonb_typeof(p_request->'payments') IS DISTINCT FROM 'array' OR jsonb_array_length(p_request->'payments') NOT BETWEEN 1 AND 3 THEN RAISE EXCEPTION 'Medios de pago invalidos.'; END IF;
  FOR v_payment IN SELECT value FROM jsonb_array_elements(p_request->'payments') LOOP
    IF jsonb_typeof(v_payment) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Pago invalido.'; END IF;
    v_method := v_payment->>'method';
    IF v_method IS NULL OR v_method NOT IN ('efectivo','tarjeta','transferencia') OR v_method = ANY(v_methods) OR jsonb_typeof(v_payment->'amount') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Metodo o importe de pago invalido.'; END IF;
    v_amount := (v_payment->>'amount')::numeric;
    IF v_amount <= 0 OR v_amount <> round(v_amount,2) THEN RAISE EXCEPTION 'Importe de pago invalido.'; END IF;
    v_paid := v_paid + v_amount; v_methods := array_append(v_methods,v_method); v_amounts := array_append(v_amounts,v_amount);
  END LOOP;
  IF v_paid <> v_total THEN RAISE EXCEPTION 'La suma de pagos no coincide con el ticket.'; END IF;
  v_ref := left(btrim(coalesce(p_request->>'payment_reference','')),100); v_note := left(btrim(coalesce(p_request->>'note','')),400);
  v_sale_id := pg_catalog.gen_random_uuid();
  v_ticket := 'PW-'||upper(left(v_branch,3))||'-'||to_char(v_sale_date,'YYYYMMDD')||'-'||replace(v_sale_id::text,'-','');
  INSERT INTO public.pw_sales(id,branch_id,sale_date,ticket,status,note,created_by,request_id,request_payload) VALUES (v_sale_id,v_branch,v_sale_date,v_ticket,'active',nullif(v_note,''),v_user,v_request_id,p_request);
  FOR v_i IN 1..array_length(v_products,1) LOOP INSERT INTO public.pw_sale_lines(sale_id,product_id,quantity,unit_price) VALUES (v_sale_id,v_products[v_i],v_quantities[v_i],v_prices[v_i]); END LOOP;
  FOR v_i IN 1..array_length(v_methods,1) LOOP INSERT INTO public.pw_sale_payments(sale_id,method,amount,reference) VALUES (v_sale_id,v_methods[v_i],v_amounts[v_i],CASE WHEN v_methods[v_i]='efectivo' THEN NULL ELSE nullif(v_ref,'') END); END LOOP;
  RETURN jsonb_build_object('id',v_sale_id,'ticket',v_ticket,'total',v_total,'branch_id',v_branch,'replayed',false);
END;
$fn$;
REVOKE ALL ON FUNCTION public.pw_register_sale_v2(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pw_register_sale_v2(jsonb) TO authenticated;

-- Preserve the existing endpoint while routing it through the controlled v2 RPC.
CREATE OR REPLACE FUNCTION public.pw_register_sale_v1(p_request jsonb)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $fn$
  SELECT public.pw_register_sale_v2(p_request)
$fn$;
REVOKE ALL ON FUNCTION public.pw_register_sale_v1(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pw_register_sale_v1(jsonb) TO authenticated;

-- A ticket can only transition active -> void once. The row lock and audit insert
-- occur in this same transaction, preserving the original lines and payments.
CREATE OR REPLACE FUNCTION public.pw_void_sale_v1(p_sale_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE v_user uuid := auth.uid(); v_sale public.pw_sales%ROWTYPE; v_reason text;
BEGIN
  IF v_user IS NULL OR NOT private.pw_is_manager() THEN RAISE EXCEPTION 'No autorizado para anular ventas.' USING ERRCODE='42501'; END IF;
  v_reason := pg_catalog.btrim(coalesce(p_reason,''));
  IF pg_catalog.char_length(v_reason) > 400 THEN RAISE EXCEPTION 'El motivo supera 400 caracteres.'; END IF;
  IF v_reason = '' THEN RAISE EXCEPTION 'El motivo de anulacion es obligatorio.'; END IF;
  SELECT * INTO v_sale FROM public.pw_sales WHERE id=p_sale_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ticket inexistente.'; END IF;
  IF v_sale.status <> 'active' THEN RAISE EXCEPTION 'El ticket ya fue anulado.' USING ERRCODE='23505'; END IF;
  UPDATE public.pw_sales SET status='void', void_reason=v_reason, voided_by=v_user, voided_at=now() WHERE id=v_sale.id AND status='active';
  IF NOT FOUND THEN RAISE EXCEPTION 'El ticket ya fue anulado.' USING ERRCODE='23505'; END IF;
  INSERT INTO public.pw_audit_events(user_id,module,action,entity_id,metadata) VALUES
    (v_user,'sales','sale_voided',v_sale.id::text,jsonb_build_object('ticket',v_sale.ticket,'branch_id',v_sale.branch_id,'reason',v_reason,'voided_at',now()));
  RETURN jsonb_build_object('id',v_sale.id,'ticket',v_sale.ticket,'status','void','voided_at',now());
END;
$fn$;
REVOKE ALL ON FUNCTION public.pw_void_sale_v1(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pw_void_sale_v1(uuid,text) TO authenticated;

-- No browser role may bypass either controlled RPC with direct sale/audit writes.
DROP POLICY IF EXISTS pw_sales_update ON public.pw_sales;
DROP POLICY IF EXISTS pw_sales_insert ON public.pw_sales;
DROP POLICY IF EXISTS pw_lines_insert ON public.pw_sale_lines;
DROP POLICY IF EXISTS pw_payments_insert ON public.pw_sale_payments;
REVOKE INSERT, UPDATE, DELETE ON public.pw_sales, public.pw_sale_lines, public.pw_sale_payments, public.pw_audit_events FROM anon, authenticated;

COMMIT;
