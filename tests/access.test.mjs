import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function harness(){
  const elements=new Map();
  const element=id=>{if(!elements.has(id))elements.set(id,{hidden:false,textContent:'',dataset:{},close(){},replaceChildren(){this.cleared=true}});return elements.get(id)};
  const context=vm.createContext({console,structuredClone,localStorage:{getItem:()=>null},document:{getElementById:element},LOCAL_KEY:'test',setTimeout});
  const source=readFileSync(new URL('../app.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').split("document.addEventListener('click'")[0];
  vm.runInContext(source+'\nglobalThis.api={validMember,authorizeUser,hydrateReadOnlyCatalog,authState,render,modal,save};',context);
  return {api:context.api,element};
}
test('only active owners and consultants pass membership validation',()=>{
  const {api}=harness();const user={id:'u'};
  for(const role of ['owner','consultant'])assert.equal(api.validMember({user_id:'u',active:true,role,branch_id:null},user),true);
  for(const role of ['employee','admin',''])assert.equal(api.validMember({user_id:'u',active:true,role,branch_id:'mora'},user),false);
  assert.equal(api.validMember({user_id:'u',active:false,role:'owner',branch_id:null},user),false);
  assert.equal(api.validMember({user_id:'other',active:true,role:'owner',branch_id:null},user),false);
});
test('employee denied before catalog requests',async()=>{
  const {api,element}=harness();const tables=[];let signedOut=false;
  api.authState.client={
    auth:{signOut:async()=>{signedOut=true}},
    from(table){
      tables.push(table);
      return {select(){return {eq(){return {maybeSingle:async()=>({data:{user_id:'u',active:true,role:'employee',branch_id:'mora'}})}}}}};
    }
  };
  assert.equal(await api.authorizeUser({id:'u'}),false);
  assert.deepEqual(tables,['pw_members']);assert.equal(signedOut,true);
  assert.equal(element('app').hidden,true);
});
test('hash render without authentication keeps application gated; local writes disabled',()=>{
  const {api,element}=harness();api.render();assert.equal(element('app').hidden,true);
  assert.throws(()=>api.modal('test'));assert.throws(()=>api.save());
});
test('empty remote catalog is valid and confirms a read',()=>{
  const {api}=harness();api.hydrateReadOnlyCatalog([{id:'mora',name:'La Mora',location_description:'La Mora',active:true}],[]);
  assert.equal(api.authState.catalogSynced,true);assert.ok(api.authState.lastCatalogRead);
});
