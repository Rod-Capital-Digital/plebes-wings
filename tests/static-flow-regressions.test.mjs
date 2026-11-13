import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
test('empleado puede entrar al flujo de recepción de su propia sucursal con protección local y RLS',()=>{
 const app=read('app.js');
 assert.match(app,/\['sale-new','sale-preview','sale-detail','delivery-receive'/);
 assert.match(app,/d\.destination_location_id!==authState\.member\.branch_id/);
 assert.match(app,/case'delivery-receive'/);
});
test('bandeja muestra sólo preparación de entregas cuando la migración 15 responde disponible',()=>{
 const app=read('app.js');
 assert.match(app,/pendingDeliveryReady=op\.pendingDelivery\?\.ready===true/);
 assert.match(app,/\$\{pendingDeliveryReady\?button\('Preparar entrega a sucursal'/);
 assert.doesNotMatch(app,/El modelo actual no persiste entregas pendientes/);
});
test('reintento de despacho no puede redirigirse a otra entrega',()=>{
 const sql=read('sql/15_BRANCH_DELIVERY_RECEIPTS_REVIEW.sql');
 assert.match(sql,/old\.id IS DISTINCT FROM p_delivery_id/);
});
