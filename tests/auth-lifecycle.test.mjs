import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../app.js',import.meta.url),'utf8')
  .replace(/^import .*;\r?\n/gm,'').split("document.addEventListener('click'")[0];
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r});return {promise,resolve}};
const user={id:'u',email:'owner@example.test'};
const branch={id:'b',name:'Sucursal',location_description:'Centro',active:true};
const member={user_id:'u',display_name:'Owner',role:'owner',branch_id:null,active:true};

function harness(options={}){
  const elements=new Map(),transitions=[],calls=[];
  let callback,subscriptions=0,storageReads=0,signouts=0;
  const element=id=>{
    if(!elements.has(id)){
      const el={hidden:true,textContent:'',value:'',dataset:{},lastChild:{textContent:''},
        setAttribute(){},replaceChildren(){this.innerHTML=''},close(){},
        classList:{toggle(){}},innerHTML:''};
      if(id==='auth-gate')el.dataset=new Proxy({}, {set(target,key,value){if(key==='state')transitions.push(value);target[key]=value;return true}});
      elements.set(id,el);
    }
    return elements.get(id);
  };
  const client={auth:{
    async getUser(){calls.push('getUser');return options.getUser?options.getUser():{data:{user:options.noSession?null:user},error:options.authError}},
    onAuthStateChange(fn){callback=fn;subscriptions++;return {data:{subscription:{unsubscribe(){}}}}},
    async signInWithPassword(){calls.push('signIn');callback?.('SIGNED_IN',{user});return {data:{user},error:null}},
    async signOut(){signouts++;if(options.logoutError)return {error:Error('offline')};callback?.('SIGNED_OUT',null);return {error:null}},
  },from(table){
    calls.push(table);
    return {select(){return {
      eq(){return {maybeSingle:async()=>options.membershipWait?options.membershipWait.promise:{data:options.member??member,error:options.memberError}}},
      order:async()=>options.catalogWait?options.catalogWait.promise:{data:table==='pw_branches'?[options.branch??branch]:[],error:options.catalogError},
    }}};
  }};
  const ctx=vm.createContext({console,structuredClone,
    setTimeout:options.fastTimeout?(fn,ms)=>setTimeout(fn,ms===15000?5:ms):setTimeout,
    clearTimeout,Date,Math,
    LOCAL_KEY:'local',localStorage:{getItem(){storageReads++;return options.raw??null}},
    getSupabaseConfigurationStatus:()=>({configured:options.configured!==false}),
    getSupabaseClient:async()=>{if(options.clientError)throw Error('CDN failed');return client},
    document:{getElementById:element,querySelectorAll:()=>[],body:{classList:{toggle(){}}}},
    location:{hash:'#inicio'},history:{replaceState(){}},window:{matchMedia:()=>({matches:false})},
  });
  // Keep actual DOM render functions; only setNav is outside the extracted source.
  vm.runInContext(source+'\nfunction setNav(){};globalThis.api={initializeAuth,verifySession,submitLogin,logout,authState,render,refreshCatalog,getData:()=>data,branchFilter};',ctx);
  return {api:ctx.api,element,calls,transitions,emit:(event,session={user})=>callback(event,session),
    get subscriptions(){return subscriptions},get storageReads(){return storageReads},get signouts(){return signouts}};
}

test('HTML inicial muestra verificación y oculta formulario y panel sin depender de JS',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.match(html,/<section[^>]*id="auth-gate"[^>]*data-state="initializing"[^>]*>/);
  assert.doesNotMatch(html,/<section[^>]*id="auth-gate"[^>]*hidden/);
  assert.match(html,/<section[^>]*id="auth-form"[^>]*hidden/);
  assert.match(html,/<div[^>]*id="app"[^>]*hidden/);
  assert.match(html,/Verificando sesión segura…/);
});

test('restaura sesión válida sin mostrar login, autoriza y renderiza; una inicialización y tres consultas',async()=>{
  const h=harness();const first=h.api.initializeAuth(),second=h.api.initializeAuth();
  assert.equal(first,second);assert.equal(h.element('auth-form').hidden,true);assert.equal(h.element('app').hidden,true);
  assert.equal(h.storageReads,0);
  await first;
  assert.equal(h.api.authState.status,'authenticated');assert.equal(h.element('app').hidden,false);
  assert.match(h.element('main-content').innerHTML,/Panorama operativo/);
  assert.equal(h.transitions.includes('unauthenticated'),false);
  assert.deepEqual(h.calls,['getUser','pw_members','pw_branches','pw_products']);
  assert.equal(h.subscriptions,1);assert.equal(h.storageReads,1);
});

test('ausencia de sesión e invalidación de Auth terminan en login sin consultas de catálogo',async()=>{
  for(const options of [{noSession:true},{authError:{name:'AuthSessionMissingError'}},{authError:{status:401}},{authError:{status:403}}]){
    const h=harness(options);await h.api.initializeAuth();
    assert.equal(h.api.authState.status,'unauthenticated');assert.equal(h.element('auth-form').hidden,false);
    assert.equal(h.element('app').hidden,true);assert.deepEqual(h.calls,['getUser']);
  }
});

test('membresía inactiva, empleado y usuario ajeno quedan denegados antes del catálogo',async()=>{
  for(const denied of [{...member,active:false},{...member,role:'employee'},{...member,user_id:'other'}]){
    const h=harness({member:denied});await h.api.initializeAuth();
    assert.equal(h.api.authState.status,'unauthorized');assert.equal(h.element('app').hidden,true);
    assert.deepEqual(h.calls,['getUser','pw_members']);assert.equal(h.signouts,1);
    assert.equal(h.api.authState.user,null);
  }
});

test('fallos de configuración, CDN, Auth, membresía y catálogo quedan cerrados y recuperables',async()=>{
  for(const options of [{configured:false},{clientError:true},{authError:Error('offline')},{memberError:Error('offline')},{catalogError:Error('offline')}]){
    const h=harness(options);await h.api.initializeAuth();
    assert.equal(h.api.authState.status,'error');assert.equal(h.element('app').hidden,true);
    assert.equal(h.element('auth-retry').hidden,false);assert.equal(h.element('auth-form').hidden,true);
    assert.equal(h.api.authState.user,null);
  }
});

test('logout borra memoria y DOM, conserva historial original y bloquea eventos tardíos',async()=>{
  const raw=JSON.stringify({version:1,products:[],tasks:[],sales:[],docs:[{id:'private'}]});
  const h=harness({raw});await h.api.initializeAuth();
  assert.equal(h.api.getData().docs[0].id,'private');
  await h.api.logout();h.emit('SIGNED_IN');await new Promise(r=>setTimeout(r,5));h.api.render();
  assert.equal(h.api.authState.status,'unauthenticated');assert.equal(h.api.authState.user,null);
  assert.equal(h.api.authState.member,null);assert.equal(h.api.authState.catalogSynced,false);
  assert.equal(h.element('main-content').innerHTML,'');assert.equal(h.element('app').hidden,true);
  assert.equal(h.api.getData().docs.some(d=>d.id==='private'),false);
  assert.equal(h.storageReads,1);
});

test('respuesta tardía de membresía después de logout no puede abrir el panel',async()=>{
  const wait=deferred(),h=harness({membershipWait:wait});const boot=h.api.initializeAuth();
  await new Promise(r=>setTimeout(r,0));await h.api.logout();
  wait.resolve({data:member});await boot;
  assert.equal(h.api.authState.status,'unauthenticated');assert.equal(h.element('app').hidden,true);
  assert.deepEqual(h.calls,['getUser','pw_members']);
});

test('respuesta tardía de catálogo después de logout no restaura datos ni panel',async()=>{
  const wait=deferred(),h=harness({catalogWait:wait});const boot=h.api.initializeAuth();
  await new Promise(r=>setTimeout(r,0));await h.api.logout();
  wait.resolve({data:[branch]});await boot;
  assert.equal(h.api.authState.status,'unauthenticated');assert.equal(h.api.authState.catalogSynced,false);
  assert.equal(h.element('app').hidden,true);assert.equal(h.storageReads,0);
});

test('fallo de logout bloquea acceso y no acepta eventos hasta cierre confirmado',async()=>{
  const h=harness({logoutError:true});await h.api.initializeAuth();await h.api.logout();h.emit('SIGNED_IN');
  assert.equal(h.api.authState.status,'error');assert.equal(h.api.authState.user,null);
  assert.equal(h.element('app').hidden,true);
});

test('login y evento SIGNED_IN no duplican membresía ni consultas; contraseña se limpia',async()=>{
  const h=harness({noSession:true});await h.api.initializeAuth();
  h.element('auth-email').value='owner@example.test';h.element('auth-password').value='test-only';
  const one=h.api.submitLogin(),two=h.api.submitLogin();await Promise.all([one,two]);
  assert.equal(h.api.authState.status,'authenticated');assert.equal(h.element('auth-password').value,'');
  assert.equal(h.calls.filter(c=>c==='signIn').length,1);assert.equal(h.calls.filter(c=>c==='pw_members').length,1);
});

test('renovación vuelve a verificar membresía sin acumular suscripciones',async()=>{
  const h=harness();await h.api.initializeAuth();h.emit('TOKEN_REFRESHED');
  await new Promise(r=>setTimeout(r,10));
  assert.equal(h.api.authState.status,'authenticated');assert.equal(h.subscriptions,1);
  assert.equal(h.calls.filter(c=>c==='pw_members').length,2);
});

test('nombres e identificadores de sucursal remotos no inyectan HTML',async()=>{
  const h=harness({branch:{...branch,id:'"><img src=x onerror=1>',name:'<script>bad()</script>'}});
  await h.api.initializeAuth();
  assert.equal(h.api.authState.status,'authenticated');
  const html=h.api.branchFilter('all','home-branch');
  assert.doesNotMatch(html,/<script>|<img/);assert.match(html,/&lt;script&gt;/);
});

test('consultant activo tiene acceso administrativo',async()=>{
  const h=harness({member:{...member,role:'consultant'}});await h.api.initializeAuth();
  assert.equal(h.api.authState.status,'authenticated');assert.equal(h.api.authState.member.role,'consultant');
});

test('navegación durante membresía pendiente mantiene formulario y contenido ocultos',async()=>{
  const wait=deferred(),h=harness({membershipWait:wait});const boot=h.api.initializeAuth();
  await new Promise(r=>setTimeout(r,0));h.api.render();
  assert.equal(h.api.authState.status,'initializing');assert.equal(h.element('auth-form').hidden,true);
  assert.equal(h.element('app').hidden,true);assert.equal(h.element('main-content').innerHTML,'');
  wait.resolve({data:member});await boot;
  assert.equal(h.transitions.includes('unauthenticated'),false);
});

test('timeout es recuperable y una membresía tardía no reautoriza',async()=>{
  const wait=deferred(),h=harness({membershipWait:wait,fastTimeout:true});
  await h.api.initializeAuth();
  assert.equal(h.api.authState.status,'error');assert.equal(h.element('auth-retry').hidden,false);
  wait.resolve({data:member});await new Promise(r=>setTimeout(r,0));
  assert.equal(h.api.authState.status,'error');assert.equal(h.element('app').hidden,true);
  assert.equal(h.calls.includes('pw_products'),false);
});

test('eventos SIGNED_IN simultáneos comparten validación sin duplicar catálogo',async()=>{
  const h=harness();await h.api.initializeAuth();h.emit('SIGNED_IN');h.emit('SIGNED_IN');
  await new Promise(r=>setTimeout(r,10));
  assert.equal(h.calls.filter(c=>c==='getUser').length,2);
  assert.equal(h.calls.filter(c=>c==='pw_members').length,2);
});

test('recarga tardía después de logout no vuelve a hidratar catálogo',async()=>{
  const options={},h=harness(options);await h.api.initializeAuth();
  const wait=deferred();options.catalogWait=wait;
  const refresh=h.api.refreshCatalog();await h.api.logout();
  wait.resolve({data:[]});await assert.rejects(refresh,/sesión cambió/);
  assert.equal(h.api.authState.catalogSynced,false);assert.equal(h.element('app').hidden,true);
});
