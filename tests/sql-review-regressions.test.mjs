import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const sql=filename=>readFileSync(new URL('../sql/'+filename,import.meta.url),'utf8');
test('migración 17 nunca declara dos claves primarias en la misma tabla',()=>{
 const value=sql('17_PARTIAL_PURCHASE_RECEIPTS_REVIEW.sql');
 const block=/CREATE TABLE IF NOT EXISTS public\.pw_purchase_receipt_lines \(([\s\S]*?)\n\);/.exec(value);
 assert.ok(block);assert.equal((block[1].match(/PRIMARY KEY/g)||[]).length,1);
 assert.match(block[1],/UNIQUE \(receipt_id, purchase_line_id\)/);
});
test('migración 17 identifica la recepción actual sin variable ambigua y conserva autorización en reintentos',()=>{
 const value=sql('17_PARTIAL_PURCHASE_RECEIPTS_REVIEW.sql');
 assert.doesNotMatch(value,/WHERE receipt_id\s*=\s*receipt_id/);
 assert.match(value,/prl\.receipt_id=v_receipt_id/);
 assert.match(value,/old\.purchase_id IS DISTINCT FROM p_purchase_id/);
 assert.match(value,/Recepción no autorizada/);
 assert.match(value,/received_request_id=p_request_id/);
});
test('migración 15 compara hash y permite replay tras recepción total, sin cambiar datos contabilizados',()=>{
 const value=sql('15_BRANCH_DELIVERY_RECEIPTS_REVIEW.sql');
 assert.match(value,/old\.payload_hash<>\('payload:'\|\|md5\(p_request::text\)\)/);
 assert.match(value,/old_receipt\.delivery_id IS DISTINCT FROM d\.id/);
 const portion=value.split('CREATE OR REPLACE FUNCTION public.pw_receive_branch_delivery_v1')[1];
 assert.ok(portion.indexOf('SELECT * INTO old_receipt')<portion.indexOf("IF d.status NOT IN ('dispatched'"));
});
