-- Run only in an isolated staging project after applying migration 08.
-- Every block rolls back; it creates no historical purchase, sale, payment or inventory movement.
BEGIN;

DO $$
DECLARE
  v_missing text;
BEGIN
  SELECT string_agg(expected, ', ' ORDER BY expected) INTO v_missing
  FROM (VALUES
    ('public.pw_purchase_documents'), ('public.pw_purchase_lines'),
    ('public.pw_create_purchase_draft_v1'), ('public.pw_confirm_purchase_v1'),
    ('public.pw_receive_purchase_v1'), ('public.pw_void_purchase_v1')
  ) AS required(expected)
  WHERE CASE WHEN expected LIKE '%.pw_%_v1' THEN to_regprocedure(expected || CASE WHEN expected LIKE '%draft%' THEN '(jsonb)' WHEN expected LIKE '%void%' THEN '(uuid,uuid,text)' ELSE '(uuid,uuid)' END) IS NULL ELSE to_regclass(expected) IS NULL END;
  IF v_missing IS NOT NULL THEN RAISE EXCEPTION 'Missing migration 08 objects: %', v_missing; END IF;
END $$;

DO $$
DECLARE
  v_bad text;
BEGIN
  SELECT string_agg(conname, ', ') INTO v_bad
  FROM pg_constraint
  WHERE conrelid = 'public.pw_purchase_documents'::regclass
    AND conname IN ('pw_purchase_documents_status','pw_purchase_documents_transition')
  HAVING count(*) <> 2;
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'Purchase document constraints are incomplete: %', v_bad; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='pw_purchase_documents_request_id_key') THEN
    RAISE EXCEPTION 'Missing request idempotency index';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='pw_purchase_lines_purchase_item_key') THEN
    RAISE EXCEPTION 'Missing duplicate-line prevention index';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name IN ('pw_purchase_documents','pw_purchase_lines') AND grantee='authenticated' AND privilege_type IN ('INSERT','UPDATE','DELETE')) THEN
    RAISE EXCEPTION 'authenticated has an unsafe direct write grant on purchase tables';
  END IF;
END $$;

ROLLBACK;
