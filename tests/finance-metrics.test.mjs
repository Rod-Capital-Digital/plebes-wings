import {test} from 'node:test';import assert from 'node:assert/strict';
import {calculateReceivedPurchaseValue,sumReceivedPurchases} from '../finance-metrics.js';
test('a partial receipt counts only accepted goods, not full order',()=>{
 const doc={status:'partially_received',locationId:'mora',total:999,lines:[{id:'a',unitCost:4.2},{id:'b',unitCost:1.5}],receipts:[{lines:[{purchaseLineId:'a',quantity:2}]}]};
 assert.deepEqual(calculateReceivedPurchaseValue(doc),{amount:8.4,complete:true});
 assert.equal(sumReceivedPurchases([doc],'mora').amount,8.4);
 assert.equal(sumReceivedPurchases([doc],'santacruz').amount,0);
});
test('without receipt details, partial purchase must not be shown as fully received',()=>{
 assert.deepEqual(calculateReceivedPurchaseValue({status:'partially_received',total:100}),{amount:null,complete:false});
 assert.equal(sumReceivedPurchases([{status:'partially_received',total:100}]).incomplete,1);
 assert.deepEqual(calculateReceivedPurchaseValue({status:'received',total:49.5}),{amount:49.5,complete:true});
});
