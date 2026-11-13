/* Purchases use controlled, idempotent RPCs; the browser never writes purchase tables directly. */
export const PURCHASE_WRITE_ENABLED = true;
export const PURCHASE_RPC = Object.freeze({
  create:'pw_create_purchase_draft_v1', confirm:'pw_confirm_purchase_v1', receive:'pw_receive_purchase_v1', void:'pw_void_purchase_v1'
});
export const PURCHASE_PARTIAL_RECEIPT_RPC=Object.freeze({receive:'pw_receive_purchase_partial_v1'});
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const METHODS=new Set(['efectivo','tarjeta','transferencia','credito','otro']);
const cents=value=>Math.round((Number(value)+Number.EPSILON)*100);
const validDate=value=>{const date=String(value||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return false;const parsed=new Date(`${date}T12:00:00Z`);return Number.isFinite(parsed.valueOf())&&parsed.toISOString().slice(0,10)===date};
const randomHex=length=>Array.from({length},()=>Math.floor(Math.random()*16).toString(16)).join('');
const newRequestId=()=>globalThis.crypto?.randomUUID?.()||`${randomHex(8)}-${randomHex(4)}-4${randomHex(3)}-8${randomHex(3)}-${randomHex(12)}`;

export function buildPurchaseDraft(input, catalog){
  const requestId=String(input?.request_id||'');
  const supplierId=String(input?.supplier_id||'');
  const locationId=String(input?.destination_location_id||'');
  const paymentMethod=String(input?.payment_method||'');
  if(!UUID.test(requestId))throw Error('La solicitud de compra no tiene un identificador válido.');
  if(!UUID.test(supplierId)||!catalog?.suppliers?.some(row=>row.id===supplierId&&row.active!==false))throw Error('Selecciona un proveedor activo.');
  if(!catalog?.locations?.some(row=>row.id===locationId&&row.active!==false&&row.location_type!=='transit'))throw Error('Selecciona una ubicación de destino activa que no sea mercancía en tránsito.');
  if(!validDate(input?.purchase_date))throw Error('La fecha de compra no es válida.');
  if(!METHODS.has(paymentMethod))throw Error('Selecciona un método de pago válido.');
  const seen=new Set();
  const lines=(input?.lines||[]).map((line,index)=>{
    const itemId=String(line?.item_id||'');
    const item=catalog?.items?.find(row=>row.id===itemId&&row.active!==false);
    const quantity=Number(line?.quantity),unitCost=Number(line?.unit_cost);
    if(line?.unit_cost===undefined||line?.unit_cost===null||String(line.unit_cost).trim()==='')throw Error('Captura el costo unitario de la compra; no se puede asumir que sea $0.');
    if(!item||seen.has(itemId))throw Error('Cada partida debe usar un insumo activo distinto.');
    if(String(line?.unit||'').trim().toLowerCase()!==String(item.base_unit||'').trim().toLowerCase())throw Error('La unidad debe coincidir con la unidad base del insumo.');
    if(!Number.isFinite(quantity)||quantity<=0||Math.round(quantity*1000)!==quantity*1000)throw Error('La cantidad admite hasta tres decimales y debe ser positiva.');
    if(!Number.isFinite(unitCost)||unitCost<0||unitCost>100000000||Math.abs(cents(unitCost)/100-unitCost)>0.000000001)throw Error('El costo unitario admite hasta dos decimales y no puede ser negativo.');
    seen.add(itemId);
    return {item_id:itemId,unit:item.base_unit,quantity,unit_cost:Number((cents(unitCost)/100).toFixed(2)),notes:String(line?.notes||'').trim().slice(0,400),line_number:index+1};
  });
  if(!lines.length||lines.length>100)throw Error('Captura entre una y cien partidas.');
  return {request_id:requestId,supplier_id:supplierId,purchase_date:String(input.purchase_date),supplier_reference:String(input.supplier_reference||'').trim().slice(0,120),receipt_reference:String(input.receipt_reference||'').trim().slice(0,180),payment_method:paymentMethod,destination_location_id:locationId,notes:String(input.notes||'').trim().slice(0,800),lines};
}

export async function loadPurchaseCatalog(client){
  if(!client?.from)throw Error('No hay conexión autenticada.');
  const [suppliers,items,locations]=await Promise.all([
    client.from('pw_suppliers').select('id,name,legal_name,tax_id,contact_name,contact_email,contact_phone,payment_terms_days,notes,active').eq('active',true).order('name'),
    client.from('pw_inventory_items').select('id,name,item_type,base_unit,active').eq('active',true).order('name'),
    client.from('pw_stock_locations').select('id,name,location_type,branch_id,active').eq('active',true).order('name')
  ]);
  const error=[suppliers.error,items.error,locations.error].find(Boolean);
  if(error)throw Error(error.message||'No fue posible cargar los catálogos de compras.');
  return {suppliers:suppliers.data||[],items:items.data||[],locations:(locations.data||[]).filter(row=>row.location_type!=='transit')};
}

export async function loadPurchaseDocuments(client){
  const {data,error}=await client.from('pw_purchase_documents')
    .select('id,document_code,purchase_date,status,payment_method,supplier_reference,receipt_reference,total_amount,destination_location_id,created_at,pw_suppliers(name),pw_stock_locations(name),pw_purchase_lines(id,line_number,item_id,item_name,unit,quantity,unit_cost,line_total,notes)')
    .order('created_at',{ascending:false}).limit(200);
  if(error)throw Error(error.message||'No fue posible consultar compras.');
  return (data||[]).map(row=>({
    id:row.id,code:row.document_code,date:row.purchase_date,status:row.status,paymentMethod:row.payment_method,
    supplier:row.pw_suppliers?.name||'Proveedor no disponible',location:row.pw_stock_locations?.name||row.destination_location_id,locationId:row.destination_location_id,
    reference:row.supplier_reference||'',receipt:row.receipt_reference||'',total:Number(row.total_amount||0),createdAt:row.created_at,
    lines:(row.pw_purchase_lines||[]).map(line=>({id:line.id,number:line.line_number,itemId:line.item_id,name:line.item_name,unit:line.unit,quantity:Number(line.quantity),unitCost:Number(line.unit_cost),total:Number(line.line_total),notes:line.notes||'',receivedQuantity:0}))
  }));
}

export async function loadPurchaseReceiptHistory(client){
  const {data,error}=await client.from('pw_purchase_receipts')
    .select('id,purchase_id,request_id,received_at,notes,inventory_transaction_id,pw_purchase_receipt_lines(id,purchase_line_id,received_quantity)')
    .order('received_at',{ascending:false}).limit(500);
  if(error)throw Error(error.message||'No fue posible consultar las recepciones de compra.');
  return (data||[]).map(row=>({id:row.id,purchaseId:row.purchase_id,requestId:row.request_id,receivedAt:row.received_at,notes:row.notes||'',transactionId:row.inventory_transaction_id,lines:(row.pw_purchase_receipt_lines||[]).map(line=>({id:line.id,purchaseLineId:line.purchase_line_id,quantity:Number(line.received_quantity)}))}));
}

export function mergePurchaseReceipts(documents,receipts){
  const grouped=new Map();
  for(const receipt of receipts||[]){const list=grouped.get(receipt.purchaseId)||[];list.push(receipt);grouped.set(receipt.purchaseId,list)}
  return (documents||[]).map(document=>{
    const history=grouped.get(document.id)||[];
    const totals=new Map();
    for(const receipt of history)for(const line of receipt.lines||[])totals.set(line.purchaseLineId,(totals.get(line.purchaseLineId)||0)+Number(line.quantity||0));
    return {...document,receipts:history,lines:document.lines.map(line=>({...line,receivedQuantity:totals.get(line.id)||0}))};
  });
}

export function buildPurchaseReceipt(input,document){
  const requestId=String(input?.request_id||'');
  if(!UUID.test(requestId))throw Error('La recepción no tiene un identificador válido.');
  if(!document?.id||!['confirmed','partially_received'].includes(document.status))throw Error('La compra no está disponible para recepción.');
  const seen=new Set();
  const lines=(input?.lines||[]).map(line=>{
    const purchaseLineId=String(line?.purchase_line_id||'');
    const source=document.lines?.find(row=>row.id===purchaseLineId);
    const quantity=Number(line?.quantity),pending=Number(source?.quantity||0)-Number(source?.receivedQuantity||0);
    if(!source||seen.has(purchaseLineId)||!Number.isFinite(quantity)||quantity<=0||Math.round(quantity*1000)!==quantity*1000||quantity>pending)throw Error('Cada recepción debe contener cantidades pendientes válidas y sin partidas repetidas.');
    seen.add(purchaseLineId);return {purchase_line_id:purchaseLineId,quantity};
  });
  if(!lines.length||lines.length>100)throw Error('Captura entre una y cien partidas recibidas.');
  return {request_id:requestId,notes:String(input?.notes||'').trim().slice(0,800),lines};
}

/* A deliberately invalid call verifies the RPC exists without creating a document. */
export async function probePurchaseModule(client){
  const catalog=await loadPurchaseCatalog(client);
  const documents=await loadPurchaseDocuments(client);
  const {error}=await client.rpc(PURCHASE_RPC.create,{p_request:{}});
  if(!error)throw Error('La comprobación de compras devolvió una respuesta inesperada.');
  const message=String(error.message||'');
  // La RPC en producción rechaza p_request={} con el error siguiente, ANTES
  // de generar cualquier documento. La comprobación debe aceptar únicamente
  // esta respuesta de validación (y su texto alternativo de contrato), no un
  // error de autorización o una función ausente.
  const rejectedAsExpected=/identificador de solicitud inv[aá]lido|solicitud de compra inv[aá]lida/i.test(message);
  if(!rejectedAsExpected){
    if(/function.*does not exist|permission denied|no autorizado|not authorized/i.test(message)){
      throw Error('La RPC de compras no está disponible para esta sesión. '+message);
    }
    throw Error(message||'No fue posible comprobar la RPC de compras.');
  }
  return {serverReady:true,catalog,documents};
}

/* Calls the review migration with invalid data only; it must never create a receipt. */
export async function probePartialPurchaseReceipts(client){
  if(!client?.rpc)return {ready:false,error:'No hay conexión autenticada.'};
  const {error}=await client.rpc(PURCHASE_PARTIAL_RECEIPT_RPC.receive,{p_purchase_id:null,p_request:{}});
  if(!error)return {ready:false,error:'La comprobación de recepción parcial devolvió una respuesta inesperada.'};
  const message=String(error.message||'');
  const missing=/function.*does not exist|could not find|schema cache|no existe/i.test(message);
  if(missing)return {ready:false,error:'La recepción parcial requiere aplicar la migración 17 revisada.'};
  const rejected=/solicitud de recepción inválida|datos de recepción inválidos|compra inexistente/i.test(message);
  return rejected?{ready:true,error:''}:{ready:false,error:message||'No se pudo comprobar recepción parcial.'};
}

async function callPurchaseRpc(client,name,args,expectedStatus){
  if(!PURCHASE_WRITE_ENABLED||!client?.rpc)throw Error('El registro de compras no está disponible.');
  const {data,error}=await client.rpc(name,args);
  if(error)throw Error(error.message||'Supabase no confirmó la operación de compra.');
  const allowed=Array.isArray(expectedStatus)?expectedStatus:[expectedStatus];
  if(!data?.id||!allowed.includes(data.status))throw Error('Supabase no confirmó el estado esperado de la compra.');
  return data;
}
export const createPurchaseDraft=(client,draft)=>callPurchaseRpc(client,PURCHASE_RPC.create,{p_request:draft},'draft');
export const confirmPurchase=(client,id,requestId=newRequestId())=>callPurchaseRpc(client,PURCHASE_RPC.confirm,{p_purchase_id:id,p_request_id:requestId},'confirmed');
export const receivePurchase=(client,id,requestId=newRequestId())=>callPurchaseRpc(client,PURCHASE_RPC.receive,{p_purchase_id:id,p_request_id:requestId},'received');
export const receivePurchasePartial=(client,id,receipt)=>callPurchaseRpc(client,PURCHASE_PARTIAL_RECEIPT_RPC.receive,{p_purchase_id:id,p_request:receipt},['partially_received','received']);
export async function setSupplierItemLink(client,{supplierId,itemId,supplierItemCode='',preferred=false,active=true}){
  if(!client?.rpc)throw Error('No hay conexión autenticada.');
  const {data,error}=await client.rpc('pw_set_supplier_inventory_item_v1',{p_request:{supplier_id:String(supplierId||''),item_id:String(itemId||''),supplier_item_code:String(supplierItemCode||'').trim(),preferred:Boolean(preferred),active:Boolean(active)}});
  if(error)throw Error(error.message||'No se pudo guardar la relación proveedor-insumo.');
  if(!data?.supplier_id||!data?.item_id)throw Error('Supabase no confirmó la relación proveedor-insumo.');
  return data;
}
export const voidPurchase=(client,id,reason,requestId=newRequestId())=>callPurchaseRpc(client,PURCHASE_RPC.void,{p_purchase_id:id,p_request_id:requestId,p_reason:String(reason||'').trim()},'void');
export const createPurchaseRequestId=newRequestId;
