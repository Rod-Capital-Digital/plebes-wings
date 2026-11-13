const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const makeId=()=>globalThis.crypto?.randomUUID?.()||`${Date.now().toString(16).padStart(8,'0')}-0000-4000-8000-${Math.random().toString(16).slice(2,14).padEnd(12,'0')}`;
const checked=async(result,message)=>{if(result?.error)throw Error(`${message} ${result.error.message||''}`.trim());if(!result?.data)throw Error(message);return result.data};
const quantity=value=>{const n=Number(value);return Number.isFinite(n)&&n>0&&Math.round(n*1000)===n*1000&&n<=1000000?n:null};
function validateLines(lines,key='item_id'){
 if(!Array.isArray(lines)||lines.length<1||lines.length>80)throw Error('La entrega requiere de 1 a 80 partidas.');
 const seen=new Set();return lines.map(line=>{const id=String(line?.[key]||'');const q=quantity(line?.quantity);if(!id||seen.has(id)||q===null)throw Error('Las partidas deben ser únicas y usar cantidades positivas de hasta tres decimales.');seen.add(id);return {[key]:id,quantity:q}});
}
export const deliveryRequestId=makeId;
export async function probePendingDeliveries(client){
 if(!client?.rpc)return {ready:false,error:'No hay conexión autenticada.'};
 const {error}=await client.rpc('pw_create_branch_delivery_v1',{p_request:{}});const message=String(error?.message||'');
 const missing=/could not find|does not exist|schema cache|no existe/i.test(message);
 return {ready:!!error&&!missing,error:missing?'Las entregas pendientes requieren aplicar la migración 15 revisada.':''};
}
export async function createPendingDelivery(client,input,requestId=makeId()){
 const date=String(input?.date||''),destination=String(input?.destination_location_id||''),responsible=String(input?.responsible||'').trim(),notes=String(input?.notes||'').trim();
 if(!UUID.test(requestId)||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!destination||!responsible||responsible.length>160||notes.length>500)throw Error('Datos de entrega inválidos.');
 const lines=validateLines(input?.lines);
 return checked(await client.rpc('pw_create_branch_delivery_v1',{p_request:{request_id:requestId,delivery_date:date,destination_location_id:destination,responsible,notes,lines}}),'No se guardó la entrega pendiente.');
}
export async function dispatchPendingDelivery(client,deliveryId,{responsible,notes=''},requestId=makeId()){
 const who=String(responsible||'').trim(),detail=String(notes||'').trim();if(!deliveryId||!UUID.test(requestId)||!who||who.length>160||detail.length>500)throw Error('Datos de despacho inválidos.');
 return checked(await client.rpc('pw_dispatch_branch_delivery_v1',{p_delivery_id:deliveryId,p_request:{request_id:requestId,responsible:who,notes:detail}}),'No se confirmó la salida de almacén.');
}
export async function receivePendingDelivery(client,deliveryId,{responsible,notes='',lines},requestId=makeId()){
 const who=String(responsible||'').trim(),detail=String(notes||'').trim();if(!deliveryId||!UUID.test(requestId)||!who||who.length>160||detail.length>500)throw Error('Datos de recepción inválidos.');
 return checked(await client.rpc('pw_receive_branch_delivery_v1',{p_delivery_id:deliveryId,p_request:{request_id:requestId,responsible:who,notes:detail,lines:validateLines(lines,'delivery_line_id')}}),'No se confirmó la recepción.');
}
export async function loadPendingDeliveries(client){
 const {data,error}=await client.from('pw_branch_deliveries').select('id,delivery_date,status,destination_location_id,prepared_responsible,notes,prepared_at,dispatched_at,dispatch_responsible,received_at,pw_branch_delivery_lines(id,item_id,planned_quantity),pw_branch_delivery_receipts(id,received_at,responsible_name,notes,pw_branch_delivery_receipt_lines(delivery_line_id,received_quantity))').order('delivery_date',{ascending:false}).order('prepared_at',{ascending:false}).limit(200);
 if(error)throw Error('No se pudo consultar el historial de entregas: '+error.message);return Array.isArray(data)?data:[];
}
