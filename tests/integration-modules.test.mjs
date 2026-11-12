import {test} from 'node:test';
import assert from 'node:assert/strict';
import {LEGAL_DOCUMENTS, validateLegalUpload, listLegalVersions, signLegalDocument, uploadLegalDocument} from '../private-documents.js';
import {buildSaleDraft,probeSalesTables,registerSale,voidSale,SALES_WRITE_ENABLED} from '../sales-integration.js';
const UUID='123e4567-e89b-42d3-a456-426614174000';
const products=[{id:'p1',name:'Alitas 6',price:99.9,active:true},{id:'p2',name:'Boneless',price:130,active:true}];
const branches=[{id:'b1',name:'La Mora'}];
const base={date:'2026-11-10',branch:'b1',quantities:{p1:2,p2:1},payment:'efectivo',requestId:UUID};

test('tres fichas legales sin publicar documentos en el código',()=>{
  assert.deepEqual(LEGAL_DOCUMENTS.map(d=>d.code),['PW-LEG-01','PW-LEG-02','PW-OPS-03']);
  for(const d of LEGAL_DOCUMENTS)assert.match(d.pending,/./);
  assert.throws(()=>validateLegalUpload({name:'claves.txt',size:120,type:'text/plain'}),/DOCX o PDF/);
  assert.throws(()=>validateLegalUpload({name:'legal.pdf',size:9*1024*1024,type:'application/pdf'}),/8 MB/);
});

test('documentos: listado privado, URL firmada de 60 segundos y carga sin sobrescribir',async()=>{
  const calls=[],version={id:'file-id',name:'version-1.docx',created_at:'2026-11-10T00:00:00Z'};
  const client={storage:{from(bucket){assert.equal(bucket,'pw-internal-documents');return {
    async list(folder){calls.push(['list',folder]);return {data:[version],error:null}},
    async createSignedUrl(path,expires,options){calls.push(['sign',path,expires,options]);return {data:{signedUrl:'https://example.supabase.co/storage/private?token=test'},error:null}},
    async upload(path,file,options){calls.push(['upload',path,options]);version.name=path.split('/').pop();return {data:{path},error:null}}
  }}}};
  assert.equal((await listLegalVersions(client,'pw-leg-01')).length,1);
  assert.match(await signLegalDocument(client,'pw-leg-01'),/https:\/\//);
  assert.equal(calls[2][2],60);
  const file={name:'original.docx',size:333,type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'};
  const path=await uploadLegalDocument(client,'pw-leg-01',file);
  assert.match(path,/^legal\/pw-leg-01\/.+\.docx$/);
  assert.equal(calls.find(c=>c[0]==='upload')[2].upsert,false);
});

test('ticket de vista previa: total y pagos expresados en centavos; sin escritura',()=>{
  const draft=buildSaleDraft(base,products,branches);
  assert.equal(draft.quoted_total,329.8);
  assert.deepEqual(draft.items.map(x=>x.quantity),[2,1]);
  assert.equal(draft.payments[0].amount,329.8);
  assert.equal(draft.request_id,UUID);
});

test('ticket: rechaza productos inválidos, pagos mixtos incorrectos y falta de idempotencia',()=>{
  assert.throws(()=>buildSaleDraft({...base,quantities:{p1:1.5}},products,branches),/cantidades/);
  assert.throws(()=>buildSaleDraft({...base,payment:'mixto',splitPayments:{efectivo:100,tarjeta:99}},products,branches),/coincidir/);
  assert.throws(()=>buildSaleDraft({...base,payment:'mixto',splitPayments:{efectivo:329.8,tarjeta:-10}},products,branches),/válidos/);
  assert.throws(()=>buildSaleDraft({...base,requestId:''},products,branches),/identificador/);
  assert.throws(()=>buildSaleDraft({...base,branch:'otro'},products,branches),/Sucursal/);
});

test('diagnóstico valida lectura y RPC transaccional sin crear registros',async()=>{
  const names=[];let rpcCalls=0;
  const client={from(table){names.push(table);return {select(_cols,opts){assert.equal(opts.head,true);return Promise.resolve({data:null,count:0,error:null})}}},
    async rpc(name,{p_request}){rpcCalls++;assert.equal(name,'pw_register_sale_v2');assert.deepEqual(p_request,{});return {data:null,error:{message:'Identificador de solicitud inválido.'}}}};
  const status=await probeSalesTables(client);
  assert.deepEqual(names,['pw_sales','pw_sale_lines','pw_sale_payments']);
  assert.equal(rpcCalls,1);
  assert.equal(status.serverReady,true);
  assert.equal(SALES_WRITE_ENABLED,true);
});
test('diagnóstico acepta mensajes SQL sin acentos y rechaza RPC inaccesible',async()=>{
  const client={from(){return {select(){return Promise.resolve({error:null})}}},
    async rpc(){return {data:null,error:{message:'Identificador de solicitud invalido.'}}}};
  assert.equal((await probeSalesTables(client)).serverReady,true);
  const denied={...client,async rpc(){return {error:{message:'permission denied for function pw_register_sale_v2'}}}};
  assert.equal((await probeSalesTables(denied)).serverReady,false);
});

test('RPC autorizada solo registra confirmaciones y expone fallos',async()=>{
  const ticket={id:UUID,ticket:'PW-MOR-20261110-'+UUID.replace(/-/g,''),total:329.8};
  const client={async rpc(name,{p_request}){assert.equal(name,'pw_register_sale_v2');assert.equal(p_request.request_id,UUID);return {data:ticket,error:null}}};
  await assert.rejects(registerSale(client,{request_id:UUID}),/bloqueado/);
  assert.deepEqual(await registerSale(client,{request_id:UUID},{approved:true}),ticket);
  await assert.rejects(registerSale({rpc:async()=>({data:null,error:{message:'Error de permisos'}})},{request_id:UUID},{approved:true}),/permisos/);
  await assert.rejects(registerSale({rpc:async()=>({data:{id:UUID},error:null})},{request_id:UUID},{approved:true}),/no confirmó/);
});

test('anulación solo invoca la RPC con identificador y motivo válidos',async()=>{
  const client={async rpc(name,args){assert.equal(name,'pw_void_sale_v1');assert.deepEqual(args,{p_sale_id:UUID,p_reason:'Ticket duplicado'});return {data:{id:UUID,status:'void'},error:null}}};
  await assert.rejects(voidSale(client,UUID,''),/motivo/);
  await assert.rejects(voidSale(client,'not-a-uuid','motivo'),/válido/);
  await assert.rejects(voidSale(client,'a'.repeat(36),'motivo'),/válido/);
  await assert.rejects(voidSale(client,UUID,'X'.repeat(401)),/400 caracteres/);
  assert.equal((await voidSale(client,UUID,'Ticket duplicado')).status,'void');
});
