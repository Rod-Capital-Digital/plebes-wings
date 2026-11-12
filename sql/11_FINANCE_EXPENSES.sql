-- Plebes Wings 11: idempotent business expense records with branch-safe authorization.
-- Existing expenses remain untouched; no fictional financial amounts are created.
BEGIN;
CREATE TABLE IF NOT EXISTS public.pw_expense_request_keys (
 request_id uuid PRIMARY KEY,
 expense_id uuid NOT NULL UNIQUE REFERENCES public.pw_expenses(id) ON DELETE RESTRICT,
 payload jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pw_expense_request_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pw_expense_request_keys FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.pw_record_expense_v1(p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor uuid:=auth.uid();v_id uuid;v_request_id uuid;v_old record;v_amount numeric;v_date date;v_branch text;v_method text;v_drawer boolean;
BEGIN
 IF v_actor IS NULL OR NOT private.pw_is_manager() THEN RAISE EXCEPTION 'Solo administración registra gastos.' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_request)<>'object' THEN RAISE EXCEPTION 'Solicitud inválida.'; END IF;
 v_request_id:=(p_request->>'request_id')::uuid;
 v_amount:=(p_request->>'amount')::numeric;
 v_date:=(p_request->>'expense_date')::date;
 v_branch:=nullif(p_request->>'branch_id','');
 v_method:=p_request->>'payment_method';v_drawer:=coalesce((p_request->>'paid_from_drawer')::boolean,false);
 IF v_request_id IS NULL OR v_amount IS NULL OR v_amount<=0 OR v_amount<>round(v_amount,2) OR v_date IS NULL
 OR length(btrim(coalesce(p_request->>'description','')))=0 OR length(btrim(coalesce(p_request->>'category','')))=0
 OR v_method NOT IN ('efectivo','tarjeta','transferencia') THEN RAISE EXCEPTION 'Datos de gasto inválidos.'; END IF;
 IF v_branch IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.pw_branches WHERE id=v_branch AND active) THEN RAISE EXCEPTION 'Sucursal desconocida.'; END IF;
 IF v_drawer AND (v_branch IS NULL OR v_method<>'efectivo') THEN RAISE EXCEPTION 'Un gasto de caja requiere sucursal y efectivo.'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_request_id::text,1101));
 SELECT expense_id,payload INTO v_old FROM public.pw_expense_request_keys WHERE request_id=v_request_id;
 IF FOUND THEN
  IF v_old.payload IS DISTINCT FROM p_request THEN RAISE EXCEPTION 'Solicitud repetida con contenido distinto.'; END IF;
  RETURN jsonb_build_object('id',v_old.expense_id,'replayed',true);
 END IF;
 IF v_drawer AND EXISTS (SELECT 1 FROM public.pw_cash_sessions WHERE branch_id=v_branch AND business_date=v_date AND status='closed') THEN RAISE EXCEPTION 'La caja de esa fecha ya fue cerrada.'; END IF;
 INSERT INTO public.pw_expenses(expense_date,branch_id,description,category,payment_method,paid_from_drawer,amount,created_by)
 VALUES(v_date,v_branch,left(btrim(p_request->>'description'),500),left(btrim(p_request->>'category'),100),v_method,v_drawer,v_amount,v_actor)
 RETURNING id INTO v_id;
 INSERT INTO public.pw_expense_request_keys(request_id,expense_id,payload) VALUES(v_request_id,v_id,p_request);
 INSERT INTO public.pw_audit_events(user_id,module,action,entity_id,metadata)
 VALUES(v_actor,'finances','expense_recorded',v_id::text,jsonb_build_object('branch_id',v_branch,'amount',v_amount,'category',p_request->>'category'));
 RETURN jsonb_build_object('id',v_id,'replayed',false);
END;$fn$;
REVOKE ALL ON FUNCTION public.pw_record_expense_v1(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pw_record_expense_v1(jsonb) TO authenticated;
-- Route authenticated business expense writes through the idempotent RPC only.
-- Existing SELECT policies remain intact. SECURITY DEFINER RPC still inserts via owner privileges.
REVOKE INSERT ON TABLE public.pw_expenses FROM authenticated, anon;
-- Policy can remain defined for historical compatibility; table privileges prevent direct insert.
COMMIT;
