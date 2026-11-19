import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const sql=readFileSync(new URL('../sql/18_RETIRE_OPERATIONAL_CATALOGS.sql',import.meta.url),'utf8');
const deletionSql=readFileSync(new URL('../sql/19_DELETE_UNUSED_OPERATIONAL_CATALOGS.sql',import.meta.url),'utf8');

test('catalog deletion is visible, confirmed, and uses only the controlled RPC',()=>{
  for(const action of ['supplier-delete','inventory-item-delete'])assert.match(app,new RegExp(`button\\('Eliminar','${action}'`));
  assert.match(app,/Eliminar permanentemente/);
  assert.match(app,/deleteCatalogRecord\(authState\.client,kind,id\)/);
  assert.doesNotMatch(app,/\.from\('pw_suppliers'\)\.delete/);
  assert.doesNotMatch(app,/\.from\('pw_inventory_items'\)\.delete/);
});

test('the legacy retirement migration preserves history and is access controlled',()=>{
  assert.match(sql,/BEGIN;[\s\S]*COMMIT;/);
  assert.match(sql,/SECURITY DEFINER/);
  assert.match(sql,/auth\.uid\(\)/);
  assert.match(sql,/private\.pw_is_manager\(\)/);
  assert.match(sql,/UPDATE public\.pw_suppliers[\s\S]*active=false/);
  assert.match(sql,/UPDATE public\.pw_inventory_items[\s\S]*active=false/);
  assert.match(sql,/UPDATE public\.pw_supplier_inventory_items[\s\S]*preferred=false/);
  for(const table of ['pw_purchase_lines','pw_inventory_movements','pw_branch_delivery_lines','pw_recipe_lines'])assert.match(sql,new RegExp(`public\\.${table}`));
  assert.match(sql,/REVOKE ALL ON FUNCTION public\.pw_retire_operational_catalog_v1/);
  assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.pw_retire_operational_catalog_v1\(text,uuid\) TO authenticated/);
  assert.doesNotMatch(sql,/DELETE FROM public\.pw_suppliers/);
  assert.doesNotMatch(sql,/DELETE FROM public\.pw_inventory_items/);
});

test('permanent deletion is restricted to unused catalog rows and revokes the old endpoint',()=>{
  assert.match(deletionSql,/CREATE OR REPLACE FUNCTION public\.pw_delete_operational_catalog_v1/);
  assert.match(deletionSql,/private\.pw_is_manager\(\)/);
  assert.match(deletionSql,/DELETE FROM public\.pw_suppliers WHERE id=p_id/);
  assert.match(deletionSql,/DELETE FROM public\.pw_inventory_items WHERE id=p_id/);
  for(const table of ['pw_purchase_documents','pw_purchase_lines','pw_inventory_movements'])assert.match(deletionSql,new RegExp(`public\\.${table}`));
  assert.match(deletionSql,/REVOKE ALL ON FUNCTION public\.pw_retire_operational_catalog_v1/);
  assert.match(deletionSql,/GRANT EXECUTE ON FUNCTION public\.pw_delete_operational_catalog_v1\(text,uuid\) TO authenticated/);
});
