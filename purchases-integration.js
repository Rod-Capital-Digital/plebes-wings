/* Purchases use controlled, idempotent RPCs; the browser never writes purchase tables directly. */
export const PURCHASE_WRITE_ENABLED = true;
export const PURCHASE_RPC = Object.freeze({
  create:'pw_create_purchase_draft_v1', confirm:'pw_confirm_purchase_v1', receive:'pw_receive_purchase_v1', void:'pw_void_purchase_v1'
});
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const METHODS=new Set(['efectivo','tarjeta','transferencia','credito','otro']);
const cents=value=>Math.round((Number(value)+Number.EPSILON)*100);
const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value||''))&&Number.isFinite(Date.parse(`${value}T12:00:00Z`));
const randomHex=length=>Array.from({length},()=>Math.floor(Math.random()*16).toString(16)).join('');
const newRequestId=()=>globalThis.crypto?.randomUUID?.()||`${randomHex(8)}-${randomHex(4)}-4${randomHex(3)}-8${randomHex(3)}-${randomHex(12)}`;

export function buildPurchaseDraft(input, catalog){
  const requestId=String(input?.request_id||'');
  const supplierId=String(input?.supplier_id||'');
  const locationId=String(input?.destination_location_id||'');
  const paymentMethod=String(input?.payment_method||'');
  if(!UUID.test(requestId))throw Error('La solicitud de compra no tiene un identificador válido.');
  if(!UUID.test(supplierId)||!catalog?.suppliers?.some(row=>row.id===supplierId&&row.active!==false))throw Error('Selecciona un proveedor activo.');
  if(!catalog?.locations?.some(row=>row.id===locationId&&row.active!==false))throw Error('Selecciona una ubicación de destino activa.');
  if(!validDate(input?.purchase_date))throw Error('La fecha de compra no es válida.');
  if(!METHODS.has(paymentMethod))throw Error('Selecciona un método de pago válido.');
  const seen=new Set();
  const lines=(input?.lines||[]).map((line,index)=>{
    const itemId=String(line?.item_id||'');
    const item=catalog?.items?.find(row=>row.id===itemId&&row.active!==false);
    const quantity=Number(line?.quantity),unitCost=Number(line?.unit_cost);
    if(!item||seen.has(itemId))throw Error('Cada partida debe usar un insumo activo distinto.');
    if(String(line?.unit||'').trim().toLowerCase()!==String(item.base_unit||'').trim().toLowerCase())throw Error('La unidad debe coincidir con la unidad base del insumo.');
    if(!Number.isFinite(quantity)||quantity<=0||Math.round(quantity*1000)!==quantity*1000)throw Error('La cantidad admite hasta tres decimales y debe ser positiva.');
    if(!Number.isFinite(unitCost)||unitCost<0||cents(unitCost)!==unitCost*100)throw Error('El costo unitario admite hasta dos decimales y no puede ser negativo.');
    seen.add(itemId);
    return {item_id:itemId,unit:item.base_unit,quantity,unit_cost:Number((cents(unitCost)/100).toFixed(2)),notes:String(line?.notes||'').trim().slice(0,400),line_number:index+1};
  });
  if(!lines.length||lines.length>100)throw Error('Captura entre una y cien partidas.');
  return {request_id:requestId,supplier_id:supplierId,purchase_date:String(input.purchase_date),supplier_reference:String(input.supplier_reference||'').trim().slice(0,120),receipt_reference:String(input.receipt_reference||'').trim().slice(0,180),payment_method:paymentMethod,destination_location_id:locationId,notes:String(input.notes||'').trim().slice(0,800),lines};
}

export async function loadPurchaseCatalog(client){
  if(!client?.from)throw Error('No hay conexión autenticada.');
  const [suppliers,items,locations]=await Promise.all([
    client.from('pw_suppliers').select('id,name,active').eq('active',true).order('name'),
    client.from('pw_inventory_items').select('id,name,item_type,base_unit,active').eq('active',true).order('name'),
    client.from('pw_stock_locations').select('id,name,location_type,branch_id,active').eq('active',true).order('name')
  ]);
  const error=[suppliers.error,items.error,locations.error].find(Boolean);
  if(error)throw Error(error.message||'No fue posible cargar los catálogos de compras.');
  return {suppliers:suppliers.data||[],items:items.data||[],locations:locations.data||[]};
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
    lines:(row.pw_purchase_lines||[]).map(line=>({id:line.id,number:line.line_number,itemId:line.item_id,name:line.item_name,unit:line.unit,quantity:Number(line.quantity),unitCost:Number(line.unit_cost),total:Number(line.line_total),notes:line.notes||''}))
  }));
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

async function callPurchaseRpc(client,name,args,expectedStatus){
  if(!PURCHASE_WRITE_ENABLED||!client?.rpc)throw Error('El registro de compras no está disponible.');
  const {data,error}=await client.rpc(name,args);
  if(error)throw Error(error.message||'Supabase no confirmó la operación de compra.');
  if(!data?.id||data.status!==expectedStatus)throw Error('Supabase no confirmó el estado esperado de la compra.');
  return data;
}
export const createPurchaseDraft=(client,draft)=>callPurchaseRpc(client,PURCHASE_RPC.create,{p_request:draft},'draft');
export const confirmPurchase=(client,id,requestId=newRequestId())=>callPurchaseRpc(client,PURCHASE_RPC.confirm,{p_purchase_id:id,p_request_id:requestId},'confirmed');
export const receivePurchase=(client,id,requestId=newRequestId())=>callPurchaseRpc(client,PURCHASE_RPC.receive,{p_purchase_id:id,p_request_id:requestId},'received');
export const voidPurchase=(client,id,reason,requestId=newRequestId())=>callPurchaseRpc(client,PURCHASE_RPC.void,{p_purchase_id:id,p_request_id:requestId,p_reason:String(reason||'').trim()},'void');
export const createPurchaseRequestId=newRequestId;
