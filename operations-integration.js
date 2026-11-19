/* Plebes Wings: remote operational data only. No localStorage persistence. */
import {validateInventoryItem} from './inventory-catalog.js';
const makeId=()=>globalThis.crypto?.randomUUID?.()||(()=>{throw Error('Este navegador requiere un generador seguro de identificadores.');})();
const check=(result,message)=>{if(result.error)throw Error(result.error.message||message);return result.data;};
export async function fetchOperations(client){
 if(!client)throw Error('Se requiere una conexión autenticada a Supabase.');
 const tasks={
  items:()=>client.from('pw_inventory_items').select('id,name,item_type,base_unit,active').eq('active',true).order('name'),
  locations:()=>client.from('pw_stock_locations').select('id,name,branch_id,active').eq('active',true).order('name'),
  balances:()=>client.from('pw_inventory_balances').select('location_id,item_id,quantity'),
  movements:()=>client.from('pw_inventory_movements').select('id,transaction_id,location_id,item_id,quantity,created_at,pw_inventory_transactions(id,movement_type,source_id,created_by,created_at),pw_inventory_items(name,base_unit),pw_stock_locations(name)').order('created_at',{ascending:false}).limit(250),
  audit:()=>client.from('pw_audit_events').select('entity_id,user_id,action,metadata,created_at').eq('module','inventory').order('created_at',{ascending:false}).limit(250),
  sessions:()=>client.from('pw_cash_sessions').select('id,branch_id,business_date,opening_float,cash_withdrawals,counted_cash,expected_cash,difference,status,created_at:opened_at').order('business_date',{ascending:false}).limit(100),
  expenses:()=>client.from('pw_expenses').select('id,expense_date,branch_id,description,category,payment_method,paid_from_drawer,amount,created_at').order('created_at',{ascending:false}).limit(200)
 };
 const entries=await Promise.all(Object.entries(tasks).map(async([key,task])=>{try{return [key,check(await task(),`No se pudo consultar ${key}.`)||[]]}catch(error){return[key,{error:error.message}]}}));
 return Object.fromEntries(entries);
}
export const operationId=makeId;
export async function catalogInsert(client,table,payload){
 if(!['pw_suppliers','pw_inventory_items'].includes(table))throw Error('Catálogo no autorizado.');
 const clean=table==='pw_inventory_items'?validateInventoryItem(payload):payload;
 const r=await client.from(table).insert(clean).select('id').single();return check(r,'No fue posible guardar el catálogo.');
}
export async function catalogUpdate(client,table,id,payload){
 if(table!=='pw_suppliers'||!id)throw Error('Actualización de catálogo no autorizada.');
 const r=await client.from(table).update(payload).eq('id',id).select('id').single();return check(r,'No fue posible actualizar el proveedor.');
}
export async function deleteCatalogRecord(client,kind,id){
 if(!client?.rpc||!['supplier','item'].includes(kind)||!id)throw Error('Eliminación de catálogo no autorizada.');
 return check(await client.rpc('pw_delete_operational_catalog_v1',{p_kind:kind,p_id:id}),'No fue posible eliminar el registro del catálogo.');
}
export async function deleteInventoryTestTransaction(client,id){
 if(!client?.rpc||!id)throw Error('El movimiento de prueba no es válido.');
 return check(await client.rpc('pw_delete_inventory_test_transaction_v1',{p_transaction_id:id}),'No fue posible eliminar el movimiento de prueba.');
}
export async function deleteBranchDeliveryTest(client,id){
 if(!client?.rpc||!id)throw Error('La entrega de prueba no es válida.');
 return check(await client.rpc('pw_delete_branch_delivery_test_v1',{p_delivery_id:id}),'No fue posible eliminar la entrega de prueba.');
}
export async function updateProjectTask(client,{id,status,note=''}){
 if(!client?.rpc||!id||!['Pendiente','En curso','Validado'].includes(status)||String(note).length>850)throw Error('Actualización de tarea no autorizada.');
 return check(await client.rpc('pw_update_project_task_v1',{p_task_id:String(id),p_status:status,p_note:String(note).trim()}),'No fue posible actualizar la Ruta del proyecto.');
}
export async function postInventory(client,{location_id,item_id,quantity,movement_type,notes=''},requestId=makeId()){
 if(!['opening','waste','adjustment'].includes(movement_type))throw Error('Tipo de movimiento inválido.');
 if(!Number.isFinite(Number(quantity))||Number(quantity)===0)throw Error('Cantidad inválida.');
 return check(await client.rpc('pw_post_inventory_movement_v1',{p_request:{request_id:requestId,location_id,item_id,quantity:Number(quantity),movement_type,notes:String(notes).slice(0,500)}}),'No se confirmó el movimiento.');
}
export async function produceInventory(client,{production_date,location_id='central',input_item_id,output_item_id,input_quantity,output_quantity,responsible_name,notes=''},requestId=makeId()){
 if(location_id!=='central'||!input_item_id||!output_item_id||input_item_id===output_item_id||!/^\d{4}-\d{2}-\d{2}$/.test(String(production_date||''))||!String(responsible_name||'').trim()||String(responsible_name).trim().length>160||String(notes||'').length>500)throw Error('Datos de preparación inválidos.');
 for(const value of [input_quantity,output_quantity])if(!Number.isFinite(Number(value))||Number(value)<=0||Math.round(Number(value)*1000)!==Number(value)*1000)throw Error('Las cantidades de preparación deben ser positivas y tener hasta tres decimales.');
 return check(await client.rpc('pw_produce_inventory_v1',{p_request:{request_id:requestId,production_date:String(production_date),location_id,input_item_id,output_item_id,input_quantity:Number(input_quantity),output_quantity:Number(output_quantity),responsible_name:String(responsible_name).trim(),notes:String(notes||'').trim()}}),'No se confirmó la preparación.');
}
export async function cashSummary(client,branch,date){return check(await client.rpc('pw_cash_summary_v1',{p_branch_id:branch,p_business_date:date}),'No fue posible calcular caja.');}
export async function openCashSession(client,{branch,date,float},requestId=makeId()){
 return check(await client.rpc('pw_open_cash_session_v1',{p_branch_id:branch,p_business_date:date,p_float:Number(float),p_request_id:requestId}),'No se confirmó la apertura.');
}
export async function closeCashSession(client,{id,counted,withdrawals,note},requestId=makeId()){
 return check(await client.rpc('pw_close_cash_session_v1',{p_session_id:id,p_counted:Number(counted),p_withdrawals:Number(withdrawals),p_note:String(note||''),p_request_id:requestId}),'No se confirmó el cierre.');
}
export async function recordExpense(client,{date,branch,description,category,method,paidFromDrawer,amount},requestId=makeId()){
 return check(await client.rpc('pw_record_expense_v1',{p_request:{request_id:requestId,expense_date:date,branch_id:branch||null,description:String(description),category:String(category),payment_method:method,paid_from_drawer:Boolean(paidFromDrawer),amount:Number(amount)}}),'No se confirmó el gasto.');
}

export async function transferStock(client,{from_location_id,to_location_id,item_id,quantity},requestId=makeId()){
 if(from_location_id===to_location_id||!Number.isFinite(Number(quantity))||Number(quantity)<=0)throw Error('Datos de traspaso inválidos.');
 return check(await client.rpc('pw_transfer_stock_v1',{p_request:{request_id:requestId,from_location_id,to_location_id,item_id,quantity:Number(quantity)}}),'No se confirmó el traspaso.');
}

export async function prepareBranchDelivery(client,{date,destination_location_id,responsible,notes='',lines},requestId=makeId()){
 const deliveryDate=String(date||''),destination=String(destination_location_id||''),person=String(responsible||'').trim(),detail=String(notes||'').trim();
 if(!/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate)||!destination||!person||person.length>160||detail.length>500||!Array.isArray(lines)||lines.length<1||lines.length>80)throw Error('Datos de entrega inválidos.');
 const seen=new Set();const normalized=lines.map(line=>{const item_id=String(line?.item_id||''),quantity=Number(line?.quantity);if(!item_id||seen.has(item_id)||!Number.isFinite(quantity)||quantity<=0||Math.round(quantity*1000)!==quantity*1000||quantity>1000000)throw Error('Las partidas de entrega deben ser únicas y tener cantidades válidas.');seen.add(item_id);return {item_id,quantity};});
 return check(await client.rpc('pw_prepare_branch_delivery_v1',{p_request:{request_id:requestId,delivery_date:deliveryDate,destination_location_id:destination,responsible:person,notes:detail,lines:normalized}}),'No se confirmó la entrega.');
}

export async function probeBranchDeliveryModule(client){
 if(!client?.rpc)return {ready:false,error:'No hay conexión autenticada.'};
 const {error}=await client.rpc('pw_prepare_branch_delivery_v1',{p_request:{}});
 if(!error)return {ready:false,error:'La verificación de entregas no rechazó una solicitud vacía.'};
 const message=String(error.message||'');
 const missing=/could not find|does not exist|schema cache|no existe/i.test(message);
 return {ready:!missing,error:missing?'La entrega por múltiples partidas requiere aplicar la migración 14 revisada.':''};
}
