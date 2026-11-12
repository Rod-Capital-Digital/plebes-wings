/* POS: el servidor crea tickets mediante una única RPC transaccional e idempotente. */
export const SALES_WRITE_ENABLED = true; // RPC verificada en plebes-wings-prod; la UI exige confirmar la disponibilidad de la sesión.
export const SALES_RPC_NAME = 'pw_register_sale_v2'; // Ruta transaccional para owner, consultant y employee, validada en PostgreSQL.
export const VOID_SALE_RPC_NAME = 'pw_void_sale_v1';
export const POS_PRODUCT_IMAGES = Object.freeze({
  ali:'assets/productos/alitas.webp',
  bon:'assets/productos/boneless.webp',
  ham:'assets/productos/hamburguesa.webp',
  pap:'assets/productos/papas.webp'
});
const METHODS=new Set(['efectivo','tarjeta','transferencia']);
const cents=v=>Math.round((Number(v)+Number.EPSILON)*100);
const money=c=>c/100;
export function visualCatalog(products){
  if(!Array.isArray(products))throw Error('El catálogo visual no es válido.');
  return products.map(product=>{
    const price=Number(product?.price);
    const purchasable=product?.active!==false&&Number.isFinite(price)&&price>0;
    const id=String(product?.id||'');
    const fallbackImage=id.startsWith('pw_burger_')?'assets/productos/hamburguesa.webp'
      :id.startsWith('pw_papas_')?'assets/productos/papas.webp':null;
    return {...product,price,purchasable,image:POS_PRODUCT_IMAGES[id]||fallbackImage};
  });
}
export function adjustCartQuantity(quantities,productId,change){
  const current=Number(quantities?.[productId]??0),delta=Number(change);
  if(!Number.isInteger(current)||current<0||current>999||!Number.isInteger(delta))throw Error('Cantidad de carrito inválida.');
  const next=Math.max(0,Math.min(999,current+delta));
  return {...quantities,[productId]:next};
}
export function cartSummary(products,quantities){
  const catalog=visualCatalog(products),lines=[];
  let totalCents=0;
  for(const product of catalog){
    const quantity=Number(quantities?.[product.id]??0);
    if(!Number.isInteger(quantity)||quantity<0||quantity>999)throw Error('Captura cantidades enteras entre 0 y 999.');
    if(!quantity)continue;
    if(!product.purchasable)throw Error('El producto no tiene precio autorizado.');
    const unitCents=cents(product.price);
    totalCents+=unitCents*quantity;
    lines.push({product_id:product.id,name:product.name,unit:product.unit,quantity,unit_price:money(unitCents),line_total:money(unitCents*quantity)});
  }
  return {lines,total:money(totalCents),units:lines.reduce((sum,line)=>sum+line.quantity,0)};
}
export function buildSaleDraft({date,branch,quantities,payment,splitPayments,reference='',note='',requestId},products,branches){
  const dateString=String(date||'');
  const dayMatch=/^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString);
  if(!dayMatch||!Number.isFinite(Date.parse(`${dateString}T12:00:00Z`))||new Date(`${dateString}T12:00:00Z`).toISOString().slice(0,10)!==dateString)throw Error('La fecha de venta no es válida.');
  if(!branches.some(b=>b.id===branch))throw Error('Sucursal no autorizada para el formulario.');
  if(!Array.isArray(products)||!products.length)throw Error('No hay catálogo disponible.');
  const items=[];let totalCents=0;
  for(const p of products){
    const qty=Number(quantities?.[p.id]??0);
    if(!Number.isInteger(qty)||qty<0||qty>999)throw Error('Captura cantidades enteras entre 0 y 999.');
    if(!qty)continue;
    if(p.active===false||!Number.isFinite(Number(p.price))||Number(p.price)<=0)throw Error('El producto no tiene precio autorizado.');
    const unitCents=cents(p.price);
    if(unitCents<1)throw Error('Precio inválido.');
    totalCents+=unitCents*qty;
    items.push({product_id:p.id,quantity:qty,quoted_unit_price:money(unitCents)});
  }
  if(!items.length||!Number.isSafeInteger(totalCents)||totalCents<1)throw Error('Selecciona al menos un producto con importe válido.');
  let payments=[];
  if(payment==='mixto'){
    const entered=[...METHODS].map(method=>({method,amount:Number(splitPayments?.[method]??0)}));
    if(entered.some(p=>!Number.isFinite(p.amount)||p.amount<0||Math.abs(cents(p.amount)-p.amount*100)>0.000001))throw Error('Los importes deben ser válidos, positivos y con máximo dos decimales.');
    payments=entered.filter(x=>x.amount>0);
    if(payments.length===0||payments.reduce((s,p)=>s+cents(p.amount),0)!==totalCents)throw Error('Los pagos mixtos deben coincidir exactamente con el total.');
    payments=payments.map(p=>({method:p.method,amount:money(cents(p.amount))}));
  }else{
    if(!METHODS.has(payment))throw Error('Forma de pago inválida.');
    payments=[{method:payment,amount:money(totalCents)}];
  }
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(requestId)))throw Error('La solicitud no tiene un identificador de prevención de duplicados.');
  return {request_id:requestId,date,branch_id:branch,items,payments,quoted_total:money(totalCents),payment_reference:String(reference).trim().slice(0,100),note:String(note).trim().slice(0,400)};
}
export async function probeSalesTables(client){
  if(!client?.from||!client?.rpc)throw Error('No hay conexión a Supabase.');
  const [sales,lines,payments,probe]=await Promise.all([
    client.from('pw_sales').select('id',{head:true,limit:1}),
    client.from('pw_sale_lines').select('id',{head:true,limit:1}),
    client.from('pw_sale_payments').select('id',{head:true,limit:1}),
    // JSON vacío garantiza que el servidor rechace antes de cualquier INSERT.
    client.rpc(SALES_RPC_NAME,{p_request:{}})
  ]);
  const readReady=![sales.error,lines.error,payments.error].some(Boolean);
  const rpcVerified=!!probe.error && /identificador de solicitud inv[aá]lido/i.test(String(probe.error.message||''));
  return {
    salesReadable:!sales.error,linesReadable:!lines.error,paymentsReadable:!payments.error,
    serverReady:readReady&&rpcVerified&&SALES_WRITE_ENABLED,
    description:readReady&&rpcVerified?'Tablas y RPC accesibles con cuenta autorizada.':'No se pudo verificar la transacción de venta.',
    error:[sales.error?.message,lines.error?.message,payments.error?.message,readReady&&!rpcVerified?probe.error?.message||'RPC no validada':''].filter(Boolean).join('; ')
  };
}
export async function registerSale(client,draft,{approved=false}={}){
  if(!SALES_WRITE_ENABLED||!approved)throw Error('Registro de ventas bloqueado: falta verificar la transacción, permisos y contrato de la RPC en el proyecto real.');
  if(!client?.rpc)throw Error('No hay cliente autenticado.');
  const {data,error}=await client.rpc(SALES_RPC_NAME,{p_request:draft});
  if(error)throw Error(error.message||'No se pudo registrar la venta; verifica el ticket antes de reintentar.');
  if(!data?.id||!data?.ticket||!Number.isFinite(Number(data.total)))throw Error('Supabase no confirmó una venta completa; verifica antes de intentar de nuevo.');
  return data;
}

export async function voidSale(client,saleId,reason){
  if(!client?.rpc)throw Error('No hay cliente autenticado.');
  const id=String(saleId||'').trim(),message=String(reason||'').trim();
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))throw Error('El ticket seleccionado no es válido.');
  if(!message)throw Error('Indica el motivo de la anulación.');
  if(message.length>400)throw Error('El motivo no puede superar 400 caracteres.');
  const {data,error}=await client.rpc(VOID_SALE_RPC_NAME,{p_sale_id:id,p_reason:message});
  if(error)throw Error(error.message||'No se pudo anular el ticket.');
  if(!data?.id||data.status!=='void')throw Error('Supabase no confirmó la anulación.');
  return data;
}
