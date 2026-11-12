-- Plebes Wings 10: one daily cash session per branch, reconciled to paid sales.
-- Depends on existing pw_sales/pw_sale_payments and pw_expenses.
BEGIN;
CREATE TABLE IF NOT EXISTS public.pw_cash_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 branch_id text NOT NULL REFERENCES public.pw_branches(id),
 business_date date NOT NULL,
 opening_float numeric(14,2) NOT NULL DEFAULT 0 CHECK (opening_float>=0),
 cash_withdrawals numeric(14,2) NOT NULL DEFAULT 0 CHECK (cash_withdrawals>=0),
 counted_cash numeric(14,2) CHECK (counted_cash IS NULL OR counted_cash>=0),
 expected_cash numeric(14,2), difference numeric(14,2),
 status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
 opened_by uuid NOT NULL REFERENCES auth.users(id),opened_at timestamptz NOT NULL DEFAULT now(),
 closed_by uuid REFERENCES auth.users(id),closed_at timestamptz,
 note text,request_id uuid NOT NULL UNIQUE,close_request_id uuid UNIQUE,
 CONSTRAINT pw_cash_session_once UNIQUE(branch_id,business_date),
 CONSTRAINT pw_cash_closed_consistency CHECK ((status='open' AND counted_cash IS NULL AND expected_cash IS NULL AND difference IS NULL AND closed_at IS NULL AND closed_by IS NULL AND close_request_id IS NULL) OR
 (status='closed' AND counted_cash IS NOT NULL AND expected_cash IS NOT NULL AND difference IS NOT NULL AND closed_at IS NOT NULL AND closed_by IS NOT NULL AND close_request_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS pw_cash_sessions_date_idx ON public.pw_cash_sessions(business_date DESC,branch_id);
ALTER TABLE public.pw_cash_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pw_cash_sessions FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.pw_cash_sessions TO authenticated;
DROP POLICY IF EXISTS pw_cash_sessions_read ON public.pw_cash_sessions;
CREATE POLICY pw_cash_sessions_read ON public.pw_cash_sessions FOR SELECT TO authenticated
 USING ((SELECT private.pw_is_manager()) OR (SELECT private.pw_can_read_branch(branch_id)));

-- Reconciliation uses posted active sales and drawer expenses, not local browser totals.
CREATE OR REPLACE FUNCTION public.pw_cash_summary_v1(p_branch_id text,p_business_date date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' STABLE AS $fn$
DECLARE v_cash numeric;v_card numeric;v_transfer numeric;v_expenses numeric;v_float numeric;v_withdrawals numeric;v_actor uuid:=auth.uid();
BEGIN
 IF v_actor IS NULL OR NOT private.pw_can_read_branch(p_branch_id) THEN RAISE EXCEPTION 'Sucursal no autorizada.' USING ERRCODE='42501'; END IF;
 SELECT coalesce(sum(CASE WHEN p.method='efectivo' THEN p.amount ELSE 0 END),0),
 coalesce(sum(CASE WHEN p.method='tarjeta' THEN p.amount ELSE 0 END),0),
 coalesce(sum(CASE WHEN p.method='transferencia' THEN p.amount ELSE 0 END),0)
 INTO v_cash,v_card,v_transfer
 FROM public.pw_sales s JOIN public.pw_sale_payments p ON p.sale_id=s.id
 WHERE s.branch_id=p_branch_id AND s.sale_date=p_business_date AND s.status='active';
 SELECT coalesce(sum(amount),0) INTO v_expenses FROM public.pw_expenses
 WHERE branch_id=p_branch_id AND expense_date=p_business_date AND paid_from_drawer=true AND payment_method='efectivo';
 SELECT opening_float,cash_withdrawals INTO v_float,v_withdrawals FROM public.pw_cash_sessions
 WHERE branch_id=p_branch_id AND business_date=p_business_date;
 RETURN jsonb_build_object('cash_sales',v_cash,'card_sales',v_card,'transfer_sales',v_transfer,
 'drawer_expenses',v_expenses,'opening_float',coalesce(v_float,0),'withdrawals',coalesce(v_withdrawals,0),
 'expected_cash',coalesce(v_float,0)+v_cash-v_expenses-coalesce(v_withdrawals,0));
END;$fn$;
CREATE OR REPLACE FUNCTION public.pw_open_cash_session_v1(p_branch_id text,p_business_date date,p_float numeric,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor uuid:=auth.uid();v_id uuid;v_record public.pw_cash_sessions%ROWTYPE;
BEGIN
 IF v_actor IS NULL OR NOT private.pw_is_manager() THEN RAISE EXCEPTION 'Solo administración puede abrir caja.' USING ERRCODE='42501'; END IF;
 IF p_request_id IS NULL OR p_float IS NULL OR p_float<0 OR p_float<>round(p_float,2) OR p_business_date IS NULL OR p_branch_id IS NULL THEN RAISE EXCEPTION 'Datos inválidos.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.pw_branches WHERE id=p_branch_id AND active) THEN RAISE EXCEPTION 'Sucursal no válida.'; END IF;
 SELECT * INTO v_record FROM public.pw_cash_sessions WHERE request_id=p_request_id;
 IF FOUND THEN
  IF v_record.branch_id<>p_branch_id OR v_record.business_date<>p_business_date OR v_record.opening_float<>p_float THEN RAISE EXCEPTION 'Solicitud duplicada diferente.'; END IF;
  RETURN jsonb_build_object('id',v_record.id,'status',v_record.status,'replayed',true);
 END IF;
 INSERT INTO public.pw_cash_sessions(branch_id,business_date,opening_float,opened_by,request_id)
 VALUES(p_branch_id,p_business_date,p_float,v_actor,p_request_id) RETURNING id INTO v_id;
 INSERT INTO public.pw_audit_events(user_id,module,action,entity_id,metadata) VALUES(v_actor,'cash','opened',v_id::text,jsonb_build_object('branch',p_branch_id,'business_date',p_business_date));
 RETURN jsonb_build_object('id',v_id,'status','open','replayed',false);
END;$fn$;
CREATE OR REPLACE FUNCTION public.pw_close_cash_session_v1(p_session_id uuid,p_counted numeric,p_withdrawals numeric,p_note text,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor uuid:=auth.uid();v_session public.pw_cash_sessions%ROWTYPE;v_summary jsonb;v_expected numeric;
BEGIN
 IF v_actor IS NULL OR NOT private.pw_is_manager() THEN RAISE EXCEPTION 'Solo administración puede cerrar caja.' USING ERRCODE='42501'; END IF;
 IF p_request_id IS NULL OR p_counted IS NULL OR p_counted<0 OR p_counted<>round(p_counted,2) OR p_withdrawals IS NULL OR p_withdrawals<0 OR p_withdrawals<>round(p_withdrawals,2) THEN RAISE EXCEPTION 'Conteo inválido.'; END IF;
 SELECT * INTO v_session FROM public.pw_cash_sessions WHERE id=p_session_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Sesión de caja inexistente.'; END IF;
 IF v_session.status='closed' AND v_session.close_request_id=p_request_id THEN RETURN jsonb_build_object('id',v_session.id,'status','closed','expected_cash',v_session.expected_cash,'difference',v_session.difference,'replayed',true); END IF;
 IF v_session.status<>'open' THEN RAISE EXCEPTION 'La caja ya está cerrada.'; END IF;
 -- Uses the same day and branch, but caller supplies final withdrawal total.
 v_summary:=public.pw_cash_summary_v1(v_session.branch_id,v_session.business_date);
 v_expected:=v_session.opening_float+(v_summary->>'cash_sales')::numeric-(v_summary->>'drawer_expenses')::numeric-p_withdrawals;
 UPDATE public.pw_cash_sessions SET counted_cash=p_counted,cash_withdrawals=p_withdrawals,expected_cash=v_expected,
 difference=p_counted-v_expected,status='closed',closed_by=v_actor,closed_at=now(),note=left(coalesce(p_note,''),500),close_request_id=p_request_id WHERE id=v_session.id;
 INSERT INTO public.pw_audit_events(user_id,module,action,entity_id,metadata) VALUES(v_actor,'cash','closed',v_session.id::text,jsonb_build_object('counted',p_counted,'expected',v_expected,'difference',p_counted-v_expected));
 RETURN jsonb_build_object('id',v_session.id,'status','closed','expected_cash',v_expected,'difference',p_counted-v_expected,'replayed',false);
END;$fn$;
REVOKE ALL ON FUNCTION public.pw_cash_summary_v1(text,date),public.pw_open_cash_session_v1(text,date,numeric,uuid),public.pw_close_cash_session_v1(uuid,numeric,numeric,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pw_cash_summary_v1(text,date),public.pw_open_cash_session_v1(text,date,numeric,uuid),public.pw_close_cash_session_v1(uuid,numeric,numeric,text,uuid) TO authenticated;
COMMIT;
