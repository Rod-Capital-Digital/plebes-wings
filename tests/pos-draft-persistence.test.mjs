import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readPosDraft,writePosDraft,clearPosDraft} from '../pos-draft.js';
const u='11111111-1111-4111-8111-111111111111',v='22222222-2222-4222-8222-222222222222';
const requestId='33333333-3333-4333-8333-333333333333';
const products=[{id:'ali',price:130,active:true},{id:'bon',price:null,active:true}];
const branches=[{id:'mora'},{id:'santacruz'}];
const memory=()=>{const map=new Map();return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)}};
test('restores current cart, branch, note and stable id after reload without recording a sale',()=>{
 const storage=memory();assert.equal(writePosDraft(storage,u,{requestId,quantities:{ali:2,bon:1},branch:'santacruz',note:'Salsa aparte',payment:'efectivo',paper:'58'},100),true);
 assert.deepEqual(readPosDraft(storage,u,products,branches,200),{requestId,quantities:{ali:2},branch:'santacruz',payment:'efectivo',paper:'58',note:'Salsa aparte',uncertain:false});
 assert.equal(readPosDraft(storage,v,products,branches,200),null);
});
test('expires, deletes empty carts and never saves card details or reference fields',()=>{
 const storage=memory();writePosDraft(storage,u,{requestId,quantities:{ali:1},branch:'mora',reference:'SECRET',payments:{tarjeta:100}},100);
 const raw=storage.getItem('plebes-pos-draft-v1:'+u);assert.doesNotMatch(raw,/SECRET|tarjeta:100/);
 assert.equal(readPosDraft(storage,u,products,branches,100+73*60*60*1000),null);
 writePosDraft(storage,u,{requestId,quantities:{ali:1}},100);clearPosDraft(storage,u);assert.equal(readPosDraft(storage,u,products,branches,110),null);
});
test('keeps uncertain request marker so checkout can be frozen until verified',()=>{
 const storage=memory();writePosDraft(storage,u,{requestId,quantities:{ali:1},branch:'mora',uncertain:true},1000);
 assert.equal(readPosDraft(storage,u,products,branches,2000).uncertain,true);
});
