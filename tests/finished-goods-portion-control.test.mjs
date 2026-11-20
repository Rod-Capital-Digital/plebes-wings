import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {INVENTORY_UNITS,isDiscreteInventoryUnit,validateInventoryQuantity} from '../inventory-catalog.js';
import {buildPurchaseDraft,buildPurchaseReceipt} from '../purchases-integration.js';
import {produceInventory,transferStock} from '../operations-integration.js';

const sql=readFileSync(new URL('../sql/25_FINISHED_GOODS_PORTION_CONTROL_AUDITADA_PENDIENTE_STAGING.sql',import.meta.url),'utf8');
const salesClient=readFileSync(new URL('../sales-integration.js',import.meta.url),'utf8');
const portal=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const requestId='11111111-1111-4111-8111-111111111111';
const supplierId='22222222-2222-4222-8222-222222222222';
const itemId='33333333-3333-4333-8333-333333333333';

test('new individual units are explicit and only accept whole quantities',()=>{
 for(const unit of ['porción','pieza','unidad','vaso','jarra'])assert.ok(INVENTORY_UNITS.includes(unit));
 assert.equal(isDiscreteInventoryUnit('vaso'),true);
 assert.equal(isDiscreteInventoryUnit('kg'),false);
 assert.throws(()=>validateInventoryQuantity(1.5,'porción'),/enteras/);
 assert.equal(validateInventoryQuantity(2,'jarra'),2);
 assert.equal(validateInventoryQuantity(0.25,'kg'),0.25);
});

test('purchases and receipts reject fractions for discrete finished goods',()=>{
 const catalog={suppliers:[{id:supplierId,active:true}],locations:[{id:'central',active:true}],items:[{id:itemId,name:'Refresco terminado',base_unit:'unidad',active:true}]};
 const base={request_id:requestId,supplier_id:supplierId,purchase_date:'2026-11-19',payment_method:'efectivo',destination_location_id:'central'};
 assert.throws(()=>buildPurchaseDraft({...base,lines:[{item_id:itemId,unit:'unidad',quantity:1.5,unit_cost:30}]},catalog),/entera/);
 const document={id:'purchase',status:'confirmed',lines:[{id:'line',name:'Refresco terminado',unit:'unidad',quantity:2,receivedQuantity:0}]};
 assert.throws(()=>buildPurchaseReceipt({request_id:requestId,lines:[{purchase_line_id:'line',quantity:1.5}]},document),/entera/);
});

test('client production and transfer reject fractions when the selected unit is discrete',async()=>{
 const client={rpc:async()=>({data:{id:'ok'},error:null})};
 await assert.rejects(produceInventory(client,{production_date:'2026-11-19',input_item_id:'raw',output_item_id:'ready',input_quantity:1.5,output_quantity:1,input_unit:'porción',output_unit:'porción',responsible_name:'Cocina'}),/enteras/);
 await assert.rejects(transferStock(client,{from_location_id:'central',to_location_id:'mora',item_id:'ready',quantity:1.5,base_unit:'unidad'}),/entera/);
});

test('audited migration seeds finished goods and drafts without stock or activation',()=>{
 for(const token of ['pw-ali-ready-portion','PW-REFRESCO-UNIT','pw_burger_sirloin_200','pw_jarra_agua_refill',"'draft'",'pw_register_sale_v3','Venta rechazada por falta de inventario','pw_inventory_movement_discrete_quantity','pw_purchase_receipt_discrete_quantity','pw_delivery_receipt_discrete_quantity'])assert.ok(sql.includes(token),token);
 assert.match(sql,/p\.id<>'bon'/);
 assert.match(sql,/count\(\*\) FROM public\.pw_recipe_lines only_line/);
 assert.match(sql,/never creates balances|never opening stock/i);
 assert.match(sql,/NOT DEPLOYED/);
});

test('portal routes sales exclusively through v3 and audited replay cannot consume a later recipe',()=>{
 assert.match(salesClient,/SALES_RPC_NAME = 'pw_register_sale_v3'/);
 assert.match(salesClient,/client\.rpc\(SALES_RPC_NAME/);
 assert.match(portal,/registerSale\(authState\.client,draft,\{approved:true\}\)/);
 assert.doesNotMatch(salesClient,/pw_register_sale_v[12]/);
 const replay=sql.indexOf("IF coalesce((v_result->>'replayed')::boolean,false) THEN");
 const consume=sql.indexOf('PERFORM private.pw_post_sale_recipe_inventory_v1');
 assert.ok(replay>=0&&consume>replay,'el replay debe terminar antes de consumir receta');
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.pw_register_sale_v1\(jsonb\) FROM PUBLIC,anon,authenticated/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.pw_register_sale_v2\(jsonb\) FROM PUBLIC,anon,authenticated/);
});
