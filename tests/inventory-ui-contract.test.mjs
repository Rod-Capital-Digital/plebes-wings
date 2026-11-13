import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const styles=readFileSync(new URL('../styles.css',import.meta.url),'utf8');

test('inventory supports location views and the confirmed delivery flow',()=>{
 for(const text of ['inventory-location','branch_id','Historial auditable','Preparar entrega a sucursal','Simulador aislado','Operación diaria de entregas','op.delivery?.ready','Motivo'])assert.ok(app.includes(text),text);
});

test('POS photos use a responsive window without distortion',()=>{
 for(const text of ['.pos-product-image','object-fit:contain','aspect-ratio:4/3','transform:scale(1.06)'])assert.ok(styles.includes(text),text);
});
