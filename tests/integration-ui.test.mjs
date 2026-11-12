import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {LEGAL_DOCUMENTS} from '../private-documents.js';
const source=readFileSync(new URL('../app.js',import.meta.url),'utf8')
  .replace(/^import .*;\r?\n/gm,'').split("document.addEventListener('click'")[0];
function harness(){
  const ctx=vm.createContext({Date,Math,structuredClone,console,setTimeout,clearTimeout,LEGAL_DOCUMENTS,SALES_WRITE_ENABLED:true,
    LOCAL_KEY:'local',localStorage:{getItem(){return null}},
    location:{hash:'#documentos'},history:{replaceState(){}},document:{getElementById(){return {hidden:true,dataset:{},classList:{toggle(){}},lastChild:{textContent:''}}}},
    window:{matchMedia:()=>({matches:false})},
  });
  vm.runInContext(source+'\nglobalThis.uiApi={renderDocuments,renderSales,authState,data};',ctx);
  return ctx.uiApi;
}
test('biblioteca legal renderiza tres fichas privadas sin exponer enlaces ni bytes',()=>{
  const h=harness();
  const page=h.renderDocuments();
  assert.match(page,/PW-LEG-01/);
  assert.match(page,/PW-LEG-02/);
  assert.match(page,/PW-OPS-03/);
  assert.equal((page.match(/data-action="legal-open"/g)||[]).length,3);
  assert.equal((page.match(/data-action="legal-upload"/g)||[]).length,3);
  assert.doesNotMatch(page,/storage\/v1\/object\/public/);
  assert.match(page,/la garantía comercial|garantía comercial/i);
});
test('ventas bloquea acciones hasta comprobar conexión y RPC de Supabase',()=>{
  const h=harness();h.authState.salesProbe={salesReadable:true,linesReadable:true,serverReady:false};
  let page=h.renderSales();
  assert.match(page,/Registro no disponible/);
  assert.doesNotMatch(page,/data-action="sale-new"/);
  h.authState.salesProbe.serverReady=true;
  h.authState.salesLoaded=true;
  page=h.renderSales();
  assert.match(page,/data-action="sale-new"/);
  assert.match(page,/Conectado: los tickets/);
});

test('historial y ventas usan registros remotos, no tickets inventados del navegador',()=>{
  const h=harness();h.authState.salesProbe={serverReady:true};h.authState.salesLoaded=true;
  h.authState.remoteSales=[{id:'s1',date:'2026-11-10',branch:'mora',ticket:'PW-MOR-TEST',items:[{productId:'ali',qty:2,unitPrice:50}],payments:[{method:'efectivo',amount:100}],total:100,voidedAt:null}];
  const html=h.renderSales();
  assert.match(html,/PW-MOR-TEST/);
  assert.match(html,/\$100\.00/);
  assert.match(html,/data-action="sale-new"/);
});

test('CSS aplica ocultamiento obligatorio a elementos con hidden',()=>{
  const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
  assert.match(css,/\[hidden\]\s*\{\s*display\s*:\s*none\s*!important\s*\}/);
});
