import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
test('abasto writes purchases through RPC integration only',()=>{
  assert.match(app,/createPurchaseDraft\(authState\.client,draft\)/);
  assert.match(app,/confirmPurchase\(authState\.client,id,requestId\)/);
  assert.match(app,/receivePurchase\(authState\.client,id,requestId\)/);
  assert.match(app,/voidPurchase\(authState\.client,id,reason,requestId\)/);
  assert.match(app,/probePurchaseModule\(authState\.client\)/);
  assert.doesNotMatch(app,/data\.purchases\.push\(/);
  assert.doesNotMatch(app,/from\('pw_purchase_documents'\)\.insert/);
  assert.doesNotMatch(app,/from\('pw_purchase_documents'\)\.update/);
});
