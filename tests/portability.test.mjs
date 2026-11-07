import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COLLECTIONS, localExport, previewLegacyImport } from '../data-portability.js';

const fixture = () => Object.assign({version:1,openingStock:{mora:{},santacruz:{}}},Object.fromEntries(COLLECTIONS.map(k=>[k,[]])));
test('export preserves original historical catalog and damaged raw content',()=>{
  const raw='{"products":[{"id":"legacy"}]}';
  assert.equal(localExport(raw).raw,raw);
  assert.equal(localExport(raw).records.products[0].id,'legacy');
  assert.equal(localExport('{damaged').raw,'{damaged');
  assert.equal(localExport('{damaged').records,null);
  assert.equal(localExport(null).records,null);
});
test('preview detects existing IDs without mutating input',()=>{
  const current=fixture(),candidate=fixture();
  current.sales=[{id:'same'}];candidate.sales=[{id:'same'},{id:'new'}];
  const before=JSON.stringify(current);
  const row=previewLegacyImport(JSON.stringify(candidate),current).find(r=>r.module==='sales');
  assert.deepEqual(row,{module:'sales',count:2,duplicates:1,newRecords:1});
  assert.equal(JSON.stringify(current),before);
  assert.deepEqual(previewLegacyImport(JSON.stringify(localExport(JSON.stringify(candidate))),current).find(r=>r.module==='sales'),row);
});
test('invalid structure, repeated IDs, missing IDs and oversized input fail closed',()=>{
  assert.throws(()=>previewLegacyImport('{}',fixture()));
  assert.throws(()=>previewLegacyImport('x'.repeat(10*1024*1024+1),fixture()));
  const candidate=fixture();candidate.sales=[{id:'same'},{id:'same'}];
  assert.throws(()=>previewLegacyImport(JSON.stringify(candidate),fixture()));
  candidate.sales=[{}];assert.throws(()=>previewLegacyImport(JSON.stringify(candidate),fixture()));
  delete candidate.sales;assert.throws(()=>previewLegacyImport(JSON.stringify(candidate),fixture()));
});
