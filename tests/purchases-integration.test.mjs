import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildPurchaseDraft, createPurchaseRequestId, probePurchaseModule, PURCHASE_RPC} from '../purchases-integration.js';

const requestId='11111111-1111-4111-8111-111111111111';
const supplierId='22222222-2222-4222-8222-222222222222';
const itemId='33333333-3333-4333-8333-333333333333';
const catalog={suppliers:[{id:supplierId,name:'Abastos',active:true}],items:[{id:itemId,name:'Pollo',base_unit:'kg',active:true}],locations:[{id:'central',name:'Almacén central',active:true}]};

test('purchase draft validates catalog, units, precision and duplicate items',()=>{
  const draft=buildPurchaseDraft({request_id:requestId,supplier_id:supplierId,purchase_date:'2026-11-11',payment_method:'efectivo',destination_location_id:'central',lines:[{item_id:itemId,unit:'kg',quantity:2.5,unit_cost:89.9}]},catalog);
  assert.equal(draft.lines[0].unit_cost,89.9);
  assert.equal(draft.lines[0].unit,'kg');
  assert.throws(()=>buildPurchaseDraft({...draft,lines:[...draft.lines,{item_id:itemId,unit:'kg',quantity:1,unit_cost:1}]},catalog),/distinto/);
  assert.throws(()=>buildPurchaseDraft({...draft,lines:[{item_id:itemId,unit:'pieza',quantity:1,unit_cost:1}]},catalog),/unidad/);
  assert.throws(()=>buildPurchaseDraft({...draft,lines:[{item_id:itemId,unit:'kg',quantity:1.0001,unit_cost:1}]},catalog),/tres decimales/);
});

test('purchase integration exposes only controlled RPC names',()=>{
  assert.deepEqual(PURCHASE_RPC,{create:'pw_create_purchase_draft_v1',confirm:'pw_confirm_purchase_v1',receive:'pw_receive_purchase_v1',void:'pw_void_purchase_v1'});
});

test('purchase request IDs have UUID form and the probe cannot create a document',async()=>{
  assert.match(createPurchaseRequestId(),/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  const reads=[];
  const source=()=>{const query={select(){return query},eq(){return query},order(){return query},limit(){return Promise.resolve({data:[],error:null})},then(resolve,reject){return Promise.resolve({data:[],error:null}).then(resolve,reject)}};return query};
  const client={from(name){reads.push(name);return source(name,[])},rpc(name,args){assert.equal(name,PURCHASE_RPC.create);assert.deepEqual(args,{p_request:{}});return Promise.resolve({data:null,error:{message:'Solicitud de compra inválida.'}})}};
  const probe=await probePurchaseModule(client);
  assert.equal(probe.serverReady,true);
  assert.deepEqual(reads,['pw_suppliers','pw_inventory_items','pw_stock_locations','pw_purchase_documents']);
});

// Regresión de producción: el servidor valida el identificador ANTES de crear un borrador.
test('probe reconoce el mensaje real de Supabase y habilita compras sin escribir filas',async()=>{
  const client={
    from(){return {select(){return this},eq(){return this},order(){return this},limit(){return Promise.resolve({data:[],error:null})},then(resolve,reject){return Promise.resolve({data:[],error:null}).then(resolve,reject)}}},
    rpc(name,args){assert.equal(name,PURCHASE_RPC.create);assert.deepEqual(args,{p_request:{}});return Promise.resolve({data:null,error:{message:'Identificador de solicitud inválido.'}})}
  };
  const result=await probePurchaseModule(client);
  assert.equal(result.serverReady,true);
  assert.deepEqual(result.documents,[]);
});

test('probe no confunde denegación de permisos ni RPC ausente con una verificación exitosa',async()=>{
  const clientFor=message=>({
    from(){return {select(){return this},eq(){return this},order(){return this},limit(){return Promise.resolve({data:[],error:null})},then(resolve,reject){return Promise.resolve({data:[],error:null}).then(resolve,reject)}}},
    rpc(){return Promise.resolve({data:null,error:{message}})}
  });
  await assert.rejects(probePurchaseModule(clientFor('No autorizado para crear compras.')),/no está disponible/);
  await assert.rejects(probePurchaseModule(clientFor('permission denied for function pw_create_purchase_draft_v1')),/no está disponible/);
  await assert.rejects(probePurchaseModule(clientFor('function public.pw_create_purchase_draft_v1 does not exist')),/no está disponible/);
  await assert.rejects(probePurchaseModule(clientFor('Fallo inesperado del servidor')),/Fallo inesperado/);
});

test('purchase draft rejects impossible calendar dates and accepts precise currency cents',()=>{
  assert.throws(()=>buildPurchaseDraft({request_id:requestId,supplier_id:supplierId,purchase_date:'2026-02-31',payment_method:'efectivo',destination_location_id:'central',lines:[{item_id:itemId,unit:'kg',quantity:1,unit_cost:0.29}]},catalog),/fecha/);
  const draft=buildPurchaseDraft({request_id:requestId,supplier_id:supplierId,purchase_date:'2026-11-12',payment_method:'efectivo',destination_location_id:'central',lines:[{item_id:itemId,unit:'kg',quantity:1,unit_cost:0.29}]},catalog);
  assert.equal(draft.lines[0].unit_cost,0.29);
});

test('una compra con costo vacío no fabrica un costo cero',()=>{
 const base={request_id:requestId,supplier_id:supplierId,purchase_date:'2026-11-12',payment_method:'efectivo',destination_location_id:'central'};
 for(const unit_cost of ['',null,undefined]){
  assert.throws(()=>buildPurchaseDraft({...base,lines:[{item_id:itemId,unit:'kg',quantity:1,unit_cost}]},catalog),/costo unitario/);
 }
 const explicit=buildPurchaseDraft({...base,lines:[{item_id:itemId,unit:'kg',quantity:1,unit_cost:0}]},catalog);
 assert.equal(explicit.lines[0].unit_cost,0);
});
