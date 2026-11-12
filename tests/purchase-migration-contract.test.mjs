import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('../sql/08_PURCHASE_DOCUMENTS_AND_LINES.sql',import.meta.url),'utf8');
test('migration 08 preserves legacy purchases and creates normalized purchase tables',()=>{
  assert.match(sql,/CREATE TABLE IF NOT EXISTS public\.pw_purchase_documents/);
  assert.match(sql,/CREATE TABLE IF NOT EXISTS public\.pw_purchase_lines/);
  assert.match(sql,/REFERENCES public\.pw_suppliers/);
  assert.match(sql,/REFERENCES public\.pw_inventory_items/);
  assert.match(sql,/REFERENCES public\.pw_stock_locations/);
  assert.match(sql,/pw_purchase_documents_supplier_reference_active_key/);
  assert.match(sql,/pw_purchase_lines_purchase_item_key/);
  assert.doesNotMatch(sql,/ALTER TABLE public\.pw_purchases/);
  assert.doesNotMatch(sql,/INSERT INTO public\.pw_purchases/);
});
test('migration 08 uses controlled idempotent RPCs and does not post inventory',()=>{
  for(const name of ['pw_create_purchase_draft_v1','pw_confirm_purchase_v1','pw_receive_purchase_v1','pw_void_purchase_v1'])assert.match(sql,new RegExp(`FUNCTION public\\.${name}`));
  assert.match(sql,/pg_advisory_xact_lock/);
  assert.match(sql,/REVOKE ALL ON TABLE public\.pw_purchase_documents, public\.pw_purchase_lines FROM anon, authenticated/);
  assert.match(sql,/GRANT SELECT ON TABLE public\.pw_purchase_documents, public\.pw_purchase_lines TO authenticated/);
  assert.match(sql,/Deliberately no inventory movement here/);
  assert.doesNotMatch(sql,/INSERT INTO public\.pw_inventory_movements/);
  assert.doesNotMatch(sql,/ALTER TABLE public\.pw_sales/);
  assert.doesNotMatch(sql,/FUNCTION public\.pw_register_sale/);
});
test('migration 08 isolates direct writes and scopes employee receipt',()=>{
  for(const policy of ['pw_purchase_documents_manager_read','pw_purchase_documents_employee_branch_read','pw_purchase_lines_manager_read','pw_purchase_lines_employee_branch_read'])assert.match(sql,new RegExp(`POLICY ${policy}`));
  assert.match(sql,/SECURITY DEFINER\s+SET search_path = ''/);
  assert.match(sql,/NOT private\.pw_is_manager\(\)/);
  assert.match(sql,/v_role = 'employee'/);
  assert.match(sql,/private\.pw_is_owner\(\)/);
  assert.match(sql,/DROP TRIGGER IF EXISTS pw_purchase_documents_set_audit_fields/);
  assert.doesNotMatch(sql,/DELETE FROM public\.pw_/);
  assert.doesNotMatch(sql,/UPDATE public\.pw_sales/);
  assert.doesNotMatch(sql,/UPDATE auth\.users/);
});
