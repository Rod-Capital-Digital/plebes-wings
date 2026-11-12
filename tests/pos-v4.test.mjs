import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {POS_PRODUCT_IMAGES,adjustCartQuantity,buildSaleDraft,cartSummary,visualCatalog} from '../sales-integration.js';

const UUID='123e4567-e89b-42d3-a456-426614174000';
const products=[
  {id:'ali',name:'Alitas',unit:'orden',price:129.5,active:true},
  {id:'bon',name:'Boneless',unit:'orden',price:134,active:true},
  {id:'ham',name:'Hamburguesa',unit:'pieza',price:null,active:true},
  {id:'pap',name:'Papas',unit:'orden',price:59.25,active:true}
];

test('POS visual asigna imágenes por identificador estable y no por nombre',()=>{
  assert.deepEqual(POS_PRODUCT_IMAGES,{
    ali:'assets/productos/alitas.webp',bon:'assets/productos/boneless.webp',
    ham:'assets/productos/hamburguesa.webp',pap:'assets/productos/papas.webp'
  });
  const catalog=visualCatalog(products);
  assert.equal(catalog.find(p=>p.id==='ali').image,POS_PRODUCT_IMAGES.ali);
  assert.equal(catalog.find(p=>p.id==='ham').purchasable,false);
  assert.equal(catalog.find(p=>p.id==='pap').purchasable,true);
});

test('carrito conserva cantidades enteras, permite retirar y bloquea productos sin precio',()=>{
  let quantities={ali:0,bon:0,ham:0,pap:0};
  quantities=adjustCartQuantity(quantities,'ali',2);
  quantities=adjustCartQuantity(quantities,'ali',-1);
  quantities=adjustCartQuantity(quantities,'bon',1);
  assert.deepEqual(quantities,{ali:1,bon:1,ham:0,pap:0});
  assert.equal(adjustCartQuantity(quantities,'ali',-9).ali,0);
  assert.throws(()=>adjustCartQuantity({ali:1.5},'ali',1),/Cantidad/);
  assert.throws(()=>cartSummary(products,{...quantities,ham:1}),/precio autorizado/);
});

test('total visual usa centavos y el borrador conserva el contrato de la RPC',()=>{
  const quantities={ali:2,bon:1,ham:0,pap:3};
  const summary=cartSummary(products,quantities);
  assert.equal(summary.units,6);
  assert.equal(summary.total,570.75);
  assert.deepEqual(summary.lines.map(line=>line.line_total),[259,134,177.75]);
  const draft=buildSaleDraft({date:'2026-11-11',branch:'mora',quantities,payment:'efectivo',requestId:UUID},products,[{id:'mora',name:'La Mora'}]);
  assert.equal(draft.quoted_total,summary.total);
  assert.deepEqual(draft.items.map(item=>item.quoted_unit_price),[129.5,134,59.25]);
});

test('POS de página completa conserva el borrador y registra únicamente por RPC',()=>{
  const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.match(app,/TOTAL ESTIMADO/);
  assert.match(app,/BORRADOR \/ NO REGISTRA VENTA NI COBRO/);
  assert.match(app,/Forma de pago prevista/);
  assert.match(app,/printKitchenDraft\(\{/);
  assert.match(app,/window\.confirm\(`Confirmar cobro/);
  assert.match(app,/registerSale\(authState\.client,draft,\{approved:true\}\)/);
  assert.match(app,/data-pos-delta/);
  assert.match(app,/frame\.contentWindow\.print\(\)/);
  assert.doesNotMatch(app,/window\.print\(\)/);
  assert.match(html,/id="print-frame"/);
  assert.doesNotMatch(app,/\.from\(['"]pw_sales['"]\)\.insert/);
});
