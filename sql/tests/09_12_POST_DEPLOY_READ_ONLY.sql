-- Read-only structural checks for the completed operational migrations 09-12.
BEGIN READ ONLY;
DO $checks$
BEGIN
 IF to_regclass('public.pw_inventory_transactions') IS NULL OR
    to_regclass('public.pw_inventory_movements') IS NULL OR
    to_regclass('public.pw_inventory_balances') IS NULL OR
    to_regclass('public.pw_cash_sessions') IS NULL OR
    to_regclass('public.pw_expense_request_keys') IS NULL
 THEN RAISE EXCEPTION 'Missing operational relations'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.pw_transfer_stock_v1(jsonb)')) THEN
   RAISE EXCEPTION 'Transfer RPC missing'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='pw_purchase_received_inventory' AND NOT tgisinternal) THEN
   RAISE EXCEPTION 'Purchase inventory posting trigger missing'; END IF;
 IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND c.relname IN ('pw_inventory_transactions','pw_inventory_movements','pw_cash_sessions','pw_expense_request_keys') AND c.relrowsecurity)<>4
 THEN RAISE EXCEPTION 'One or more operational tables lack RLS'; END IF;
END;$checks$;
SELECT location_id,item_id,quantity FROM public.pw_inventory_balances ORDER BY location_id,item_id LIMIT 50;
ROLLBACK;
