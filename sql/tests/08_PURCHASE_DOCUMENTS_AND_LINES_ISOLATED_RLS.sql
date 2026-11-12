-- Run only against a disposable local database or Supabase branch after migration 08.
-- Never run in production. All identities, catalog fixtures and documents are rolled back.
BEGIN;

INSERT INTO auth.users (id) VALUES
  ('71000000-0000-0000-0000-000000000001'),
  ('71000000-0000-0000-0000-000000000002'),
  ('71000000-0000-0000-0000-000000000003');
INSERT INTO public.pw_members (user_id, display_name, role, branch_id, active) VALUES
  ('71000000-0000-0000-0000-000000000001', 'Purchase RLS Owner', 'owner', NULL, true),
  ('71000000-0000-0000-0000-000000000002', 'Purchase RLS Consultant', 'consultant', NULL, true),
  ('71000000-0000-0000-0000-000000000003', 'Purchase RLS Employee Mora', 'employee', 'mora', true);

INSERT INTO public.pw_suppliers (id, name) VALUES
  ('72000000-0000-0000-0000-000000000001', 'RLS purchase supplier');
INSERT INTO public.pw_inventory_items (id, name, item_type, base_unit) VALUES
  ('73000000-0000-0000-0000-000000000001', 'RLS purchase item', 'raw_material', 'kg');

-- Owner creates a draft, verifies direct writes are impossible, then confirms it.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000001', true);
DO $owner$
DECLARE
  v_created jsonb; v_repeat jsonb; v_confirmed jsonb; v_confirm_repeat jsonb; v_id uuid;
  v_request jsonb := jsonb_build_object(
    'request_id','74000000-0000-4000-8000-000000000001',
    'supplier_id','72000000-0000-0000-0000-000000000001',
    'purchase_date',(now() AT TIME ZONE 'America/Mexico_City')::date::text,
    'payment_method','efectivo','destination_location_id','mora','supplier_reference','RLS-PO-001',
    'lines',jsonb_build_array(jsonb_build_object('item_id','73000000-0000-0000-0000-000000000001','unit','kg','quantity',2.5,'unit_cost',80.25))
  );
BEGIN
  v_created := public.pw_create_purchase_draft_v1(v_request);
  v_repeat := public.pw_create_purchase_draft_v1(v_request);
  IF v_created->>'id' IS NULL OR (v_repeat->>'replayed')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'Draft idempotency failed'; END IF;
  v_id := (v_created->>'id')::uuid; PERFORM set_config('pw08.purchase_id', v_id::text, true);
  BEGIN
    INSERT INTO public.pw_purchase_documents (document_code,supplier_id,purchase_date,payment_method,destination_location_id,request_id,request_payload)
    VALUES ('UNSAFE-DIRECT','72000000-0000-0000-0000-000000000001',current_date,'efectivo','mora','74000000-0000-4000-8000-000000000099','{}');
    RAISE EXCEPTION 'Owner unexpectedly wrote a purchase table directly';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  v_confirmed := public.pw_confirm_purchase_v1(v_id, '74000000-0000-4000-8000-000000000002');
  v_confirm_repeat := public.pw_confirm_purchase_v1(v_id, '74000000-0000-4000-8000-000000000002');
  IF v_confirmed->>'status' <> 'confirmed' OR (v_confirm_repeat->>'replayed')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'Confirmation state or idempotency failed'; END IF;
END;
$owner$;
RESET ROLE;

-- Consultant can read the confirmed document but cannot void it.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000002', true);
DO $consultant$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.pw_purchase_documents WHERE id=current_setting('pw08.purchase_id')::uuid AND status='confirmed') THEN RAISE EXCEPTION 'Consultant cannot read confirmed purchase'; END IF;
  BEGIN
    PERFORM public.pw_void_purchase_v1(current_setting('pw08.purchase_id')::uuid, '74000000-0000-4000-8000-000000000003', 'not owner');
    RAISE EXCEPTION 'Consultant unexpectedly voided a purchase';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$consultant$;
RESET ROLE;

-- Employee can read and receive only the document for La Mora; receipt is idempotent.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000003', true);
DO $employee$
DECLARE v_received jsonb; v_repeat jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.pw_purchase_documents WHERE id=current_setting('pw08.purchase_id')::uuid) THEN RAISE EXCEPTION 'Employee cannot read assigned-branch purchase'; END IF;
  v_received := public.pw_receive_purchase_v1(current_setting('pw08.purchase_id')::uuid, '74000000-0000-4000-8000-000000000004');
  v_repeat := public.pw_receive_purchase_v1(current_setting('pw08.purchase_id')::uuid, '74000000-0000-4000-8000-000000000004');
  IF v_received->>'status' <> 'received' OR (v_repeat->>'replayed')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'Employee receipt state or idempotency failed'; END IF;
END;
$employee$;
RESET ROLE;

DO $check$
BEGIN
  IF (SELECT total_amount FROM public.pw_purchase_documents WHERE id=current_setting('pw08.purchase_id')::uuid) <> 200.63 THEN RAISE EXCEPTION 'Document total did not preserve line amount'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pw_audit_events WHERE module='purchases' AND action='purchase_received_pending_inventory' AND entity_id=current_setting('pw08.purchase_id')) THEN RAISE EXCEPTION 'Receipt audit event is missing'; END IF;
END;
$check$;

ROLLBACK;
