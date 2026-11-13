import test from 'node:test';
import assert from 'node:assert/strict';
import {probeBranchDeliveryModule} from '../operations-integration.js';

test('the delivery capability probe never writes and treats a missing RPC as unavailable',async()=>{
 const calls=[];
 const client={rpc:async(name,args)=>{calls.push({name,args});return {error:{message:'Could not find the function in the schema cache'}};}};
 const state=await probeBranchDeliveryModule(client);
 assert.equal(calls.length,1);
 assert.equal(calls[0].name,'pw_prepare_branch_delivery_v1');
 assert.deepEqual(calls[0].args,{p_request:{}});
 assert.equal(state.ready,false);
});
