import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('../sql/07_OPERATIONAL_CATALOGS_AND_LOCATIONS.sql',import.meta.url),'utf8');
const isolatedRls=readFileSync(new URL('../sql/tests/07_OPERATIONAL_CATALOGS_AND_LOCATIONS_ISOLATED_RLS.sql',import.meta.url),'utf8');
const postDeployChecks=readFileSync(new URL('../sql/tests/07_OPERATIONAL_CATALOGS_AND_LOCATIONS_POST_DEPLOY_CHECKS.sql',import.meta.url),'utf8');

test('migración 07 es aditiva y crea los tres catálogos operativos',()=>{
  assert.match(sql,/BEGIN;[\s\S]*COMMIT;/);
  for(const table of ['pw_suppliers','pw_inventory_items','pw_stock_locations']){
    assert.match(sql,new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table}`));
    assert.match(sql,new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`));
  }
  assert.match(sql,/REFERENCES public\.pw_products\(id\) ON DELETE RESTRICT/);
  assert.match(sql,/REFERENCES public\.pw_branches\(id\) ON DELETE RESTRICT/);
  assert.match(sql,/created_by uuid REFERENCES auth\.users\(id\)/);
  assert.match(sql,/updated_by uuid REFERENCES auth\.users\(id\)/);
  assert.match(sql,/pw_inventory_items_name_type_unit_key/);
  assert.match(sql,/pw_suppliers_name_normalized_key/);
  assert.match(sql,/pw_stock_locations_name_normalized_key/);
});

test('migración 07 crea únicamente las ubicaciones base sin movimientos operativos',()=>{
  assert.match(sql,/\('central', 'Almacén central', 'central', NULL/);
  assert.match(sql,/\('mora', 'La Mora', 'branch', 'mora'/);
  assert.match(sql,/\('santacruz', 'Santa Cruz Atzcapotzaltongo', 'branch', 'santacruz'/);
  assert.doesNotMatch(sql,/INSERT INTO public\.pw_purchases/);
  assert.doesNotMatch(sql,/INSERT INTO public\.pw_sales/);
  assert.doesNotMatch(sql,/INSERT INTO public\.pw_expenses/);
  assert.doesNotMatch(sql,/INSERT INTO public\.pw_inventory_movements/);
});

test('migración 07 es segura al reintentarse y protege la atribución de auditoría',()=>{
  assert.match(sql,/CREATE UNIQUE INDEX IF NOT EXISTS pw_suppliers_name_normalized_key/);
  assert.match(sql,/DROP TRIGGER IF EXISTS pw_suppliers_set_audit_fields/);
  assert.match(sql,/ON CONFLICT \(id\) DO NOTHING/);
  assert.match(sql,/IF v_actor IS NOT NULL THEN[\s\S]*NEW\.created_by := v_actor/);
  assert.match(sql,/NEW\.created_by := OLD\.created_by/);
  assert.match(sql,/updated_by = \(SELECT auth\.uid\(\)\)/);
});

test('migración 07 aplica mínimos privilegios y separa owner, consultant y employee',()=>{
  assert.match(sql,/REVOKE ALL ON TABLE public\.pw_suppliers, public\.pw_inventory_items, public\.pw_stock_locations/);
  assert.match(sql,/GRANT SELECT, INSERT, UPDATE ON TABLE public\.pw_suppliers, public\.pw_inventory_items, public\.pw_stock_locations/);
  assert.doesNotMatch(sql,/GRANT DELETE/);
  assert.match(sql,/pw_suppliers_owner_all[\s\S]*private\.pw_is_owner\(\)/);
  assert.match(sql,/pw_inventory_items_manager_active[\s\S]*private\.pw_is_manager\(\)/);
  assert.match(sql,/pw_stock_locations_manager_read_active/);
  assert.match(sql,/pw_inventory_items_member_read_active[\s\S]*private\.pw_is_active_member\(\)/);
  assert.match(sql,/pw_stock_locations_branch_read_active[\s\S]*private\.pw_can_read_branch\(branch_id\)/);
  assert.match(sql,/DROP POLICY IF EXISTS pw_suppliers_owner_all/);
});

test('migración 07 no modifica ventas ni sus RPCs',()=>{
  assert.doesNotMatch(sql,/ALTER TABLE public\.pw_sales/);
  assert.doesNotMatch(sql,/CREATE OR REPLACE FUNCTION public\.pw_register_sale/);
  assert.doesNotMatch(sql,/CREATE OR REPLACE FUNCTION public\.pw_void_sale/);
  assert.doesNotMatch(sql,/DROP POLICY IF EXISTS pw_sales/);
});

test('la prueba RLS aislada usa identidades temporales y revierte todo',()=>{
  assert.match(isolatedRls,/Run only against an isolated local database or a disposable Supabase branch/);
  assert.match(isolatedRls,/INSERT INTO auth\.users/);
  assert.match(isolatedRls,/SET LOCAL ROLE authenticated/);
  assert.match(isolatedRls,/request\.jwt\.claim\.sub/);
  assert.match(isolatedRls,/RLS Owner/);
  assert.match(isolatedRls,/RLS Consultant/);
  assert.match(isolatedRls,/RLS Employee Mora/);
  assert.match(isolatedRls,/ROLLBACK;/);
  assert.doesNotMatch(isolatedRls,/COMMIT;/);
});

test('la verificación posterior comprueba FKs, privilegios y trigger, no solo texto SQL',()=>{
  assert.match(postDeployChecks,/BEGIN READ ONLY;/);
  assert.match(postDeployChecks,/confrelid = 'public\.pw_products'::regclass/);
  assert.match(postDeployChecks,/confrelid = 'public\.pw_branches'::regclass/);
  assert.match(postDeployChecks,/has_table_privilege\('authenticated', 'public\.pw_suppliers', 'delete'\)/);
  assert.match(postDeployChecks,/p\.proname = 'pw_set_catalog_audit_fields'/);
  assert.match(postDeployChecks,/tgname = 'pw_suppliers_set_audit_fields'/);
  assert.match(postDeployChecks,/ROLLBACK;/);
});
