import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PURCHASE_PARTIAL_RECEIPT_RPC,buildPurchaseReceipt,mergePurchaseReceipts,receivePurchasePartial,setSupplierItemLink} from '../purchases-integration.js';

const purchaseId='11111111-1111-4111-8111-111111111111';
const lineA='22222222-2222-4222-8222-222222222222';
const lineB='33333333-3333-4333-8333-333333333333';
const requestId='44444444-4444-4444-8444-444444444444';
const document={id:purchaseId,status:'partially_received',lines:[{id:lineA,quantity:5,receivedQuantity:2},{id:lineB,quantity:3,receivedQuantity:0}]};

test('partial receipt accepts only outstanding quantities and a stable request identifier',()=>{
  const receipt=buildPurchaseReceipt({request_id:requestId,notes:'Entrega incompleta',lines:[{purchase_line_id:lineA,quantity:3},{purchase_line_id:lineB,quantity:1}]},document);
  assert.deepEqual(receipt.lines,[{purchase_line_id:lineA,quantity:3},{purchase_line_id:lineB,quantity:1}]);
  assert.throws(()=>buildPurchaseReceipt({request_id:requestId,lines:[{purchase_line_id:lineA,quantity:3.001}]},document),/pendientes válidas/);
  assert.throws(()=>buildPurchaseReceipt({request_id:requestId,lines:[{purchase_line_id:lineA,quantity:1},{purchase_line_id:lineA,quantity:1}]},document),/sin partidas repetidas/);
});

test('receipt history accumulates received quantities without mutating the ordered quantities',()=>{
  const merged=mergePurchaseReceipts([{...document,status:'confirmed'}],[{id:'r1',purchaseId,lines:[{purchaseLineId:lineA,quantity:2}]},{id:'r2',purchaseId,lines:[{purchaseLineId:lineA,quantity:1},{purchaseLineId:lineB,quantity:3}]}]);
  assert.equal(merged[0].lines.find(line=>line.id===lineA).receivedQuantity,3);
  assert.equal(merged[0].lines.find(line=>line.id===lineB).receivedQuantity,3);
  assert.equal(merged[0].lines.find(line=>line.id===lineA).quantity,5);
});

test('partial-receipt and supplier links are controlled RPC calls',async()=>{
  const calls=[];
  const client={rpc(name,args){calls.push({name,args});if(name===PURCHASE_PARTIAL_RECEIPT_RPC.receive)return Promise.resolve({data:{id:purchaseId,status:'partially_received'},error:null});return Promise.resolve({data:{supplier_id:'s',item_id:'i'},error:null})}};
  await receivePurchasePartial(client,purchaseId,{request_id:requestId,lines:[{purchase_line_id:lineA,quantity:1}]});
  await setSupplierItemLink(client,{supplierId:'s',itemId:'i',preferred:true});
  assert.equal(calls[0].name,'pw_receive_purchase_partial_v1');
  assert.equal(calls[1].name,'pw_set_supplier_inventory_item_v1');
  assert.equal(calls[1].args.p_request.preferred,true);
});

test('review migration disables full-line trigger and posts only receipt lines atomically',()=>{
  const sql=readFileSync(new URL('../sql/17_PARTIAL_PURCHASE_RECEIPTS_REVIEW.sql',import.meta.url),'utf8');
  for(const part of ['pw_supplier_inventory_items','pw_purchase_receipts','pw_purchase_receipt_lines','partially_received','DROP TRIGGER IF EXISTS pw_purchase_received_inventory','pw_receive_purchase_partial_v1','pg_advisory_xact_lock','source_line_id','REVOKE INSERT, UPDATE, DELETE'])assert.match(sql,new RegExp(part));
  assert.match(sql,/qty>remaining/);
  assert.match(sql,/FOR UPDATE/);
  assert.match(sql,/pw_receive_purchase_v1[\s\S]*pw_receive_purchase_partial_v1/);
});

test('purchase UI exposes partial-receipt history and no direct purchase writes',()=>{
  const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
  assert.match(app,/Recibir partidas/);
  assert.match(app,/openPurchaseReceipt/);
  assert.match(app,/Vincular proveedor e insumo/);
  assert.doesNotMatch(app,/from\('pw_purchase_documents'\)\.insert/);
  assert.doesNotMatch(app,/from\('pw_purchase_documents'\)\.update/);
});
