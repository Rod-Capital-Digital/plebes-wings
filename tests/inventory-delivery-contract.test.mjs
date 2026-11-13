import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {prepareBranchDelivery,probeBranchDeliveryModule} from '../operations-integration.js';

const sql=readFileSync(new URL('../sql/14_BRANCH_DELIVERIES_REVIEW.sql',import.meta.url),'utf8');
const UUID='123e4567-e89b-42d3-a456-426614174000';

test('entrega diaria propuesta es atómica, idempotente y sólo sale de central',()=>{
  for(const text of ['pw_prepare_branch_delivery_v1','location_id=\'central\'','pg_advisory_xact_lock','request_id','v_balance<v_quantity','branch_delivery_confirmed','operation_reason','pw_reverse_branch_delivery_v1','reversal_of','branch_delivery_reversed','REVOKE INSERT, UPDATE, DELETE','REVOKE ALL ON FUNCTION'])assert.match(sql,new RegExp(text));
  assert.match(sql,/\(v_tx,'central',v_item,-v_quantity\),\(v_tx,v_destination,v_item,v_quantity\)/);
});

test('escenario SQL de entrega está aislado y revierte sus fixtures',()=>{
 const isolated=readFileSync(new URL('../sql/tests/14_BRANCH_DELIVERIES_ISOLATED.sql',import.meta.url),'utf8');
 for(const text of ['BEGIN;','ROLLBACK;','pw_prepare_branch_delivery_v1','pw_reverse_branch_delivery_v1','reversal idempotency','Saldo insuficiente','pw_transfer_stock_v1','Employee can read central stock'])assert.ok(isolated.includes(text),text);
});

test('cliente de entrega valida partidas y usa sólo la RPC controlada',async()=>{
  const calls=[];const client={rpc:async(name,args)=>{calls.push({name,args});return {data:{id:'ok'},error:null}}};
  await prepareBranchDelivery(client,{date:'2026-11-12',destination_location_id:'mora',responsible:'Encargado',lines:[{item_id:'a',quantity:1.25}]},UUID);
  assert.equal(calls[0].name,'pw_prepare_branch_delivery_v1');
  await assert.rejects(prepareBranchDelivery(client,{date:'2026-11-12',destination_location_id:'mora',responsible:'Encargado',lines:[{item_id:'a',quantity:1},{item_id:'a',quantity:2}]},UUID),/únicas/);
});
