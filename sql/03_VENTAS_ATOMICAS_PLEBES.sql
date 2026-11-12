-- Plebes Wings: venta atómica, folio en servidor y reintentos idempotentes.
-- Reutiliza las tablas de venta existentes. Los cambios son aditivos.
ALTER TABLE public.pw_sales ADD COLUMN IF NOT EXISTS request_id uuid;
ALTER TABLE public.pw_sales ADD COLUMN IF NOT EXISTS request_payload jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS pw_sales_request_id_uidx ON public.pw_sales (request_id) WHERE request_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.pw_register_sale_v1(p_request jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_request_id uuid;
  v_existing public.pw_sales%ROWTYPE;
  v_branch text;
  v_date_text text;
  v_sale_date date;
  v_item jsonb;
  v_payment jsonb;
  v_products text[] := ARRAY[]::text[];
  v_qty integer[] := ARRAY[]::integer[];
  v_prices numeric[] := ARRAY[]::numeric[];
  v_methods text[] := ARRAY[]::text[];
  v_amounts numeric[] := ARRAY[]::numeric[];
  v_product text;
  v_quantity integer;
  v_price numeric;
  v_method text;
  v_amount numeric;
  v_total numeric := 0;
  v_paid numeric := 0;
  v_sale_id uuid;
  v_ticket text;
  v_ref text;
  v_note text;
  v_i integer;
BEGIN
  IF v_user IS NULL OR NOT private.pw_is_manager() THEN
    RAISE EXCEPTION 'No autorizado para registrar ventas.' USING ERRCODE='42501';
  END IF;
  IF p_request IS NULL OR jsonb_typeof(p_request) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Solicitud de venta inválida.';
  END IF;
  IF coalesce(p_request->>'request_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'Identificador de solicitud inválido.';
  END IF;
  v_request_id := (p_request->>'request_id')::uuid;
  -- Serializa reintentos simultáneos de la misma solicitud.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_request_id::text, 1739));
  SELECT * INTO v_existing FROM public.pw_sales WHERE request_id=v_request_id;
  IF FOUND THEN
    IF v_existing.request_payload IS DISTINCT FROM p_request THEN
      RAISE EXCEPTION 'La solicitud ya se utilizó con contenido diferente.';
    END IF;
    SELECT coalesce(sum(line_total),0) INTO v_total FROM public.pw_sale_lines WHERE sale_id=v_existing.id;
    RETURN pg_catalog.jsonb_build_object('id',v_existing.id,'ticket',v_existing.ticket,'total',v_total,'branch_id',v_existing.branch_id,'replayed',true);
  END IF;

  v_branch := p_request->>'branch_id';
  IF v_branch IS NULL OR NOT EXISTS(SELECT 1 FROM public.pw_branches WHERE id=v_branch AND active) THEN
    RAISE EXCEPTION 'Sucursal inexistente o inactiva.';
  END IF;
  v_date_text := p_request->>'date';
  IF coalesce(v_date_text,'') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
    RAISE EXCEPTION 'Fecha de venta inválida.';
  END IF;
  v_sale_date := v_date_text::date;
  IF v_sale_date < ((now() AT TIME ZONE 'America/Mexico_City')::date - 30)
      OR v_sale_date > ((now() AT TIME ZONE 'America/Mexico_City')::date + 1) THEN
    RAISE EXCEPTION 'Fecha fuera del periodo de captura autorizado.';
  END IF;
  IF jsonb_typeof(p_request->'items') IS DISTINCT FROM 'array'
     OR pg_catalog.jsonb_array_length(p_request->'items') NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'La venta requiere entre 1 y 80 partidas.';
  END IF;
  FOR v_item IN SELECT value FROM pg_catalog.jsonb_array_elements(p_request->'items') LOOP
    IF jsonb_typeof(v_item) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Partida inválida.'; END IF;
    v_product := v_item->>'product_id';
    IF coalesce(v_product,'')='' OR v_product=ANY(v_products) THEN
      RAISE EXCEPTION 'Producto inexistente o duplicado en ticket.';
    END IF;
    IF coalesce(v_item->>'quantity','') !~ '^[1-9][0-9]{0,2}$'
       OR jsonb_typeof(v_item->'quantity') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'Cantidad inválida.';
    END IF;
    v_quantity := (v_item->>'quantity')::integer;
    SELECT sale_price INTO v_price FROM public.pw_products
      WHERE id=v_product AND active FOR SHARE;
    IF NOT FOUND OR v_price IS NULL OR v_price<=0 OR v_price>1000000 OR v_price<>round(v_price,2) THEN
      RAISE EXCEPTION 'Producto inactivo, sin precio o precio inválido.';
    END IF;
    IF jsonb_typeof(v_item->'quoted_unit_price') IS DISTINCT FROM 'number'
       OR (v_item->>'quoted_unit_price')::numeric <> v_price THEN
      RAISE EXCEPTION 'El precio cambió; vuelve a consultar el catálogo.';
    END IF;
    v_total:=v_total+v_price*v_quantity;
    v_products:=pg_catalog.array_append(v_products,v_product);
    v_qty:=pg_catalog.array_append(v_qty,v_quantity);
    v_prices:=pg_catalog.array_append(v_prices,v_price);
  END LOOP;
  v_total:=round(v_total,2);
  IF v_total<=0 OR v_total>10000000 THEN RAISE EXCEPTION 'Importe total inválido.'; END IF;
  IF jsonb_typeof(p_request->'quoted_total') IS DISTINCT FROM 'number'
     OR (p_request->>'quoted_total')::numeric <> v_total THEN
    RAISE EXCEPTION 'El importe enviado no coincide con el cálculo del servidor.';
  END IF;
  IF jsonb_typeof(p_request->'payments') IS DISTINCT FROM 'array'
     OR pg_catalog.jsonb_array_length(p_request->'payments') NOT BETWEEN 1 AND 3 THEN
    RAISE EXCEPTION 'Es necesario indicar entre 1 y 3 medios de pago.';
  END IF;
  FOR v_payment IN SELECT value FROM pg_catalog.jsonb_array_elements(p_request->'payments') LOOP
    IF jsonb_typeof(v_payment) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Pago inválido.'; END IF;
    v_method := v_payment->>'method';
    IF v_method NOT IN ('efectivo','tarjeta','transferencia') OR v_method=ANY(v_methods) THEN
      RAISE EXCEPTION 'Método de pago no autorizado o duplicado.';
    END IF;
    IF jsonb_typeof(v_payment->'amount') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'Importe de pago inválido.';
    END IF;
    v_amount := (v_payment->>'amount')::numeric;
    IF v_amount<=0 OR v_amount<>round(v_amount,2) THEN RAISE EXCEPTION 'Importe de pago inválido.'; END IF;
    v_paid:=v_paid+v_amount;
    v_methods:=pg_catalog.array_append(v_methods,v_method);
    v_amounts:=pg_catalog.array_append(v_amounts,v_amount);
  END LOOP;
  IF v_paid<>v_total THEN RAISE EXCEPTION 'La suma de pagos no coincide con el ticket.'; END IF;

  v_ref:=left(pg_catalog.btrim(coalesce(p_request->>'payment_reference','')),100);
  v_note:=left(pg_catalog.btrim(coalesce(p_request->>'note','')),400);
  v_sale_id:=pg_catalog.gen_random_uuid();
  v_ticket:='PW-'||upper(left(v_branch,3))||'-'||to_char(v_sale_date,'YYYYMMDD')||'-'||replace(v_sale_id::text,'-','');
  INSERT INTO public.pw_sales(id,branch_id,sale_date,ticket,status,note,created_by,request_id,request_payload)
    VALUES(v_sale_id,v_branch,v_sale_date,v_ticket,'active',nullif(v_note,''),v_user,v_request_id,p_request);
  FOR v_i IN 1..pg_catalog.array_length(v_products,1) LOOP
    INSERT INTO public.pw_sale_lines(sale_id,product_id,quantity,unit_price)
      VALUES(v_sale_id,v_products[v_i],v_qty[v_i],v_prices[v_i]);
  END LOOP;
  FOR v_i IN 1..pg_catalog.array_length(v_methods,1) LOOP
    INSERT INTO public.pw_sale_payments(sale_id,method,amount,reference)
      VALUES(v_sale_id,v_methods[v_i],v_amounts[v_i],CASE WHEN v_methods[v_i]='efectivo' THEN NULL ELSE nullif(v_ref,'') END);
  END LOOP;
  RETURN pg_catalog.jsonb_build_object('id',v_sale_id,'ticket',v_ticket,'total',v_total,'branch_id',v_branch,'replayed',false);
END;
$function$;
REVOKE ALL ON FUNCTION public.pw_register_sale_v1(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pw_register_sale_v1(jsonb) TO authenticated;
