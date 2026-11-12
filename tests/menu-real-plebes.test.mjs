import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {visualCatalog} from '../sales-integration.js';
const manifest=JSON.parse(readFileSync(new URL('../data/menu_real_plebes_wings.json',import.meta.url),'utf8'));
test('Menú oficial: 18 presentaciones distintas con precio positivo',()=>{
 assert.equal(manifest.productos.length,18);
 assert.equal(new Set(manifest.productos.map(p=>p.id)).size,18);
 assert.ok(manifest.productos.every(p=>p.precio_mxn>0));
 assert.equal(manifest.productos.find(p=>p.id==='ali').precio_mxn,130);
 assert.equal(manifest.productos.find(p=>p.id==='bon').precio_mxn,130);
});
test('POS muestra categorías nuevas con imágenes y filtra inactivos',()=>{
 const catalog=visualCatalog(manifest.productos.map(p=>({id:p.id,name:p.nombre,price:p.precio_mxn,active:true})));
 assert.equal(catalog.find(p=>p.id==='pw_burger_sirloin_200').image,'assets/productos/hamburguesa.webp');
 assert.equal(catalog.find(p=>p.id==='pw_papas_chicas_125').image,'assets/productos/papas.webp');
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.ok((app.match(/visualCatalog\(data\.products\.filter\(p=>p\.active!==false\)\)/g)||[]).length>=3);
});
