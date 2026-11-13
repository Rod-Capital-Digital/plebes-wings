import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildPurchaseDraft, loadPurchaseCatalog} from '../purchases-integration.js';
const get = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const m14=get('sql/14_BRANCH_DELIVERIES_REVIEW.sql');
const m15=get('sql/15_BRANCH_DELIVERY_RECEIPTS_REVIEW.sql');
const m16=get('sql/16_RECIPES_AND_COSTS_REVIEW.sql');
const m17=get('sql/17_PARTIAL_PURCHASE_RECEIPTS_REVIEW.sql');
const fixture=(id='123e4567-e89b-42d3-a456-426614174000')=>({request_id:id,supplier_id:id,purchase_date:'2026-11-12',payment_method:'efectivo',destination_location_id:'in_transit',lines:[{item_id:id,quantity:1,unit:'kg',unit_cost:25}]});
test('migraciones 14-17 son preparadas y preservan transacciones SQL',()=>{
 for(const [name,sql] of Object.entries({m14,m15,m16,m17})){
  assert.match(sql,/BEGIN\s*;/i,name);
  assert.match(sql,/COMMIT\s*;/i,name);
  assert.match(sql,/REVIEW-ONLY|REVIEW/i,name);
 }
});
test('15 impide manipular inventario en tránsito mediante RPC históricas y protege saldos',()=>{
 assert.match(m15,/CREATE TRIGGER pw_guard_transit_inventory_v1/);
 assert.match(m15,/coalesce\(v_notes,''\) !~ '\^\(dispatch\|receipt\)/);
 assert.match(m15,/REVOKE EXECUTE ON FUNCTION public\.pw_prepare_branch_delivery_v1\(jsonb\),/);
 assert.match(m15,/public\.pw_reverse_branch_delivery_v1\(jsonb\) FROM authenticated/);
 assert.match(m15,/IF transit_balance < qty THEN RAISE EXCEPTION 'Saldo insuficiente de mercancía en tránsito\.'/);
 assert.match(m15,/SELECT \* INTO d FROM public\.pw_branch_deliveries WHERE id=p_delivery_id FOR UPDATE/);
});
test('14 conserva versión previa necesaria para test de traspaso antes de migración 15',()=>{
 assert.match(m14,/CREATE OR REPLACE FUNCTION public\.pw_prepare_branch_delivery_v1/);
 const test14=get('sql/tests/14_BRANCH_DELIVERIES_ISOLATED.sql');
 assert.match(test14,/quantity',5\.001/);
 assert.match(test14,/coalesce\(\(SELECT quantity FROM public\.pw_inventory_balances WHERE location_id='mora'/);
});
test('16 mantiene recetas sin escrituras directas y una sola versión activa',()=>{
 assert.match(m16,/pw_recipe_versions_one_active_product_idx/);
 assert.match(m16,/WHERE status='active'/);
 assert.match(m16,/ENABLE ROW LEVEL SECURITY/);
 assert.match(m16,/REVOKE ALL ON public\.pw_inventory_item_costs/);
 assert.doesNotMatch(m16,/CREATE OR REPLACE FUNCTION public\.pw_register_sale_v2/);
});
test('17 desactiva el trigger antiguo antes de contabilizar sólo recibido y valida reintentos',()=>{
 assert.match(m17,/DROP TRIGGER IF EXISTS pw_purchase_received_inventory ON public\.pw_purchase_documents/);
 assert.match(m17,/INSERT INTO public\.pw_purchase_receipt_lines\(receipt_id,purchase_line_id,received_quantity\)/);
 assert.match(m17,/INSERT INTO public\.pw_inventory_movements/);
 assert.match(m17,/SELECT \* INTO d FROM public\.pw_purchase_documents WHERE id=p_purchase_id FOR UPDATE/);
 assert.match(m17,/RETURN public\.pw_receive_purchase_partial_v1\(p_purchase_id,p\)/);
});
test('pruebas aisladas requieren una transacción reversible y no se hacen contra producción',()=>{
 for(const id of ['14_BRANCH_DELIVERIES','15_BRANCH_DELIVERIES','16_RECIPES_SCHEMA','17_PARTIAL_PURCHASE_RECEIPTS']){
  const s=get(`sql/tests/${id}_ISOLATED.sql`);
  assert.match(s,/\bBEGIN\s*;/);
  assert.match(s,/\bROLLBACK\s*;/);
 }
 const script=get('tools/test-sql-local.ps1');
 assert.match(script,/127\.0\.0\.1/);
 assert.match(script,/No ejecuta SQL contra producción/);
});
test('frontend de compras excluye tránsito como destino de recepción',async()=>{
 const id='123e4567-e89b-42d3-a456-426614174000';
 const catalog={suppliers:[{id,active:true}],items:[{id,active:true,base_unit:'kg'}],locations:[{id:'in_transit',active:true,location_type:'transit'}]};
 assert.throws(()=>buildPurchaseDraft(fixture(id),catalog),/ubicación.*tránsito/i);
 const table=(name)=>({select(){return this},eq(){return this},order:async()=>({data:name==='pw_stock_locations'?[{id:'in_transit',location_type:'transit'},{id:'central',location_type:'central'}]:[],error:null})});
 const res=await loadPurchaseCatalog({from:table});
 assert.deepEqual(res.locations.map(x=>x.id),['central']);
});
