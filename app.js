/* PLEBES WINGS: authenticated catalog and preserved local operational history. */
import { LOCAL_KEY, previewLegacyImport, localExport } from './data-portability.js';
import { getSupabaseClient, getSupabaseConfigurationStatus } from './supabase-client.js';
import { LEGAL_DOCUMENTS, findLegalDocument, listLegalVersions, signLegalDocument, uploadLegalDocument } from './private-documents.js';
import { adjustCartQuantity, buildSaleDraft, cartSummary, probeSalesTables, registerSale, visualCatalog, voidSale, SALES_WRITE_ENABLED } from './sales-integration.js';
import {fetchOperations,catalogInsert,postInventory,cashSummary,openCashSession,closeCashSession,recordExpense,transferStock,operationId} from './operations-integration.js';
import { buildPurchaseDraft, confirmPurchase, createPurchaseDraft, createPurchaseRequestId, loadPurchaseCatalog, loadPurchaseDocuments, probePurchaseModule, receivePurchase, voidPurchase, PURCHASE_WRITE_ENABLED } from './purchases-integration.js';

'use strict';
const KEY=LOCAL_KEY;
let BRANCHES=[{id:'mora',name:'La Mora',short:'Entrada de La Mora'},{id:'santacruz',name:'Santa Cruz',short:'Centro de Santa Cruz'}];
const METHODS=[['efectivo','Efectivo'],['tarjeta','Tarjeta'],['transferencia','Transferencia']];
const PAGE_NAMES={inicio:'Resumen general',ruta:'Ruta del proyecto',documentos:'Biblioteca de entregables',ventas:'Ventas y pedidos',pedido:'Tomar pedido',abasto:'Compras y entregas',inventario:'Inventario y mermas',caja:'Corte de caja',finanzas:'Gastos y finanzas',equipo:'Personal y protocolos',ajustes:'Menú y configuración'};
const icons={
'layout-dashboard':'<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
'route':'<circle cx="6" cy="19" r="2"/><path d="M9 19h7a4 4 0 0 0 0-8h-8a4 4 0 0 1 0-8h8"/><circle cx="18" cy="3" r="2"/>',
'files':'<path d="M15 2H6a2 2 0 0 0-2 2v14"/><path d="M8 6h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z"/><path d="M10 12h6M10 16h6"/>',
'shopping-bag':'<path d="M4 8h16l-1 13H5L4 8Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/>',
'shopping-cart':'<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h3l3 15h12l3-11H5"/>',
'truck':'<path d="M1 4h14v12H1zM15 8h4l4 5v3h-8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="19" cy="18.5" r="2.5"/>',
'package':'<path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="M3 7v10l9 5 9-5V7M12 12v10"/>',
'wallet':'<path d="M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14H5a2 2 0 0 1-2-2V6Z"/><path d="M3 8h18M16 12h6v5h-6a2 2 0 0 1 0-5Z"/>',
'chart':'<path d="M3 3v18h18M7 15l4-4 3 3 6-7"/>',
'shield':'<path d="m12 22 7-4V6l-7-4-7 4v12l7 4Z"/><path d="m9 12 2 2 4-4"/>',
'settings':'<circle cx="12" cy="12" r="3"/><path d="m19 13 2 1-2 4-2-1-2 1-.4 2h-5l-.3-2-2-1-2 1-2-4 2-1v-2l-2-1 2-4 2 1 2-1 .3-2h5l.4 2 2 1 2-1 2 4-2 1v2Z"/>',
'menu':'<path d="M4 6h16M4 12h16M4 18h16"/>',
'plus':'<path d="M12 5v14M5 12h14"/>',
'x':'<path d="M18 6 6 18M6 6l12 12"/>',
'arrow-right':'<path d="M5 12h14M13 6l6 6-6 6"/>',
'check':'<path d="m5 12 4 4L19 6"/>',
'alert':'<path d="m12 3 10 18H2L12 3Z"/><path d="M12 9v4m0 4h.01"/>',
'circle-info':'<circle cx="12" cy="12" r="10"/><path d="M12 11v6m0-10h.01"/>',
'calendar':'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
'clock':'<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
'coins':'<circle cx="12" cy="12" r="9"/><path d="M14.5 9.5a3 3 0 0 0-5 2c0 4 5 1 5 4a3 3 0 0 1-5 1M12 7v11"/>',
'clipboard':'<rect x="5" y="5" width="14" height="17" rx="2"/><rect x="9" y="2" width="6" height="5" rx="1"/><path d="M9 13h6M9 17h6"/>',
'users':'<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M17 4a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 5"/>',
'lock':'<rect x="4" y="10" width="16" height="12" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4"/>',
'download':'<path d="M12 3v13m-5-5 5 5 5-5M4 19v2h16v-2"/>',
'upload':'<path d="M12 16V3m-5 5 5-5 5 5M4 17v4h16v-4"/>',
'store':'<path d="M3 10h18l-2-7H5l-2 7ZM4 10v11h16V10M9 21v-8h6v8"/>',
'filter':'<path d="M4 6h16M7 12h10M10 18h4"/>',
'flame':'<path d="M12 22c5 0 8-4 8-8 0-3-2-6-5-9 .5 5-2 5-3 2-1-2-.5-4-1-5-2 2-7 7-7 12 0 4 3 8 8 8Z"/><path d="M12 22c2 0 4-2 4-5 0-2-2-4-3-5-.3 3-2 3-3 1-2 3-2 4-2 5 0 2 2 4 4 4Z"/>',
'external':'<path d="M14 3h7v7M10 14 21 3M21 13v8H3V3h8"/>',
'edit':'<path d="m15 5 4 4M4 20l4-.9L20 7a2 2 0 0 0-3-3L5 16l-1 4Z"/>',
'archive':'<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v13h14V8M9 13h6"/>',
'chevron':'<path d="m9 18 6-6-6-6"/>'};
const I=(name,size=18)=>`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]||icons['circle-info']}</svg>`;
const sanitize=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const number=value=>{const v=Number(value);return Number.isFinite(v)?v:0};
const moneyFormatter=new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:2});
const integerFormatter=new Intl.NumberFormat('es-MX',{maximumFractionDigits:2});
const dateFormatter=new Intl.DateTimeFormat('es-MX',{day:'2-digit',month:'short',year:'numeric'});
const money=value=>moneyFormatter.format(number(value));
const integer=value=>integerFormatter.format(number(value));
function localISO(){const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')}
function fmtDate(date){if(!date)return 'Sin fecha';try{return dateFormatter.format(new Date(date+'T12:00:00'))}catch{return date}}
function uid(){return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,9)}`}
function branchName(id){return BRANCHES.find(x=>x.id===id)?.name||'Central'}
function methodName(id){return METHODS.find(x=>x[0]===id)?.[1]||id}
function productName(id){return data.products.find(p=>p.id===id)?.name||'Producto retirado'}
function timeStamp(dateStr){return new Date((dateStr||localISO())+'T12:00:00').getTime()||0}
const sortByDate=arr=>[...arr].sort((a,b)=>timeStamp(b.date)-timeStamp(a.date)||String(b.created||'').localeCompare(String(a.created||'')));
const seedTasks=[
['diagnostico','01','Diagnóstico inicial y necesidades de ambos puestos','Registrar condiciones, ubicaciones, menú, abastecimiento y riesgos.','Validado'],
['menu','01','Definir catálogo, presentaciones y precios','Obtener precios y estandarizar tamaños/piezas por porción.','Pendiente'],
['existencias','01','Conteo físico y punto de partida','Registrar existencias iniciales reales de cada sucursal.','Pendiente'],
['compras','02','Trazabilidad de compras y proveedores','Registrar Central de Abastos, pollerías, cantidades y comprobantes.','Pendiente'],
['entregas','02','Control de producción y entregas','Separar preparación central, traslado y recepción por sucursal.','Pendiente'],
['caja','02','Registro de ventas y conciliación de caja','Registrar cada pedido y cotejar efectivo, tarjeta y transferencias.','Pendiente'],
['mermas','02','Inventario, mermas y cierres diarios','Comparar entradas, salidas, conteos físicos y faltantes.','Pendiente'],
['higiene','02','Protocolos de higiene y cadena de frío','Documentar prácticas y registros acordes a NOM-251.','Pendiente'],
['jornadas','02','Completar piloto de 14 jornadas','Validar el proceso con los propietarios antes de delegar.','Pendiente'],
['manual','03','Manual de apertura, preparación y cierre','Procedimiento replicable para operar el puesto sin exponer recetas.','Pendiente'],
['capacitacion','03','Capacitación y evaluación del primer empleado','Definir funciones, competencias, supervisión y evaluación.','Pendiente'],
['confidencialidad','03','Política de información reservada y confidencialidad','Identificar secretos, restringir acceso y solicitar revisión jurídica.','Pendiente'],
['contratacion','03','Paquete laboral y ruta de regularización','Contrato, privacidad, obligaciones patronales y permisos: revisión especializada.','Pendiente'],
['digital','04','Portal digital multiusuario y sincronización','Preparar backend, accesos diferenciados y seguridad de datos.','Pendiente'],
['indicadores','04','Tablero de ventas, costos y márgenes','Añadir utilidad real cuando se conozcan costos y porciones.','Pendiente']
];
const seedDocs=[
['diagnostico','Diagnóstico empresarial','Resumen de la situación operativa y los hallazgos de la reunión inicial.','Operación','Por preparar'],
['procesos','Mapa del proceso operativo','Compras → producción → entregas → preparación → venta → cierre.','Operación','Por preparar'],
['manual','Manual del punto de venta','Apertura, servicio, preparación final, higiene, cobros y cierre.','Operación','Por preparar'],
['inventario','Procedimiento de inventario y mermas','Entregas firmadas, conteos físicos, diferencias y evidencias.','Operación','Por preparar'],
['caja','Procedimiento de venta y corte','Registro de tickets, manejo de efectivo, terminal y transferencias.','Finanzas','Por preparar'],
['confidencialidad','Convenio de confidencialidad','Protección de secretos industriales, sujeto a revisión legal.','Legal','Por preparar'],
['empleado','Contrato y descripción del puesto','Condiciones laborales, funciones, horarios y responsabilidades.','Personal','Por preparar'],
['privacidad','Aviso de privacidad para personal','Tratamiento y resguardo de datos personales de empleados.','Legal','Por preparar'],
['capacitacion','Plan de capacitación','Inducción, pruebas de ejecución, manejo higiénico y supervisión.','Personal','Por preparar'],
['formalizacion','Matriz de regularización','Revisiones fiscales, sanitarias, municipales y de seguridad social.','Legal','Por preparar']
];
function freshData(){return {version:1,createdAt:new Date().toISOString(),products:[
{id:'ali',name:'Alitas',unit:'porción',price:null,cost:null,detail:'Definir número de piezas y presentaciones.'},
{id:'bon',name:'Boneless',unit:'porción',price:null,cost:null,detail:'Definir gramos o piezas por porción.'},
{id:'ham',name:'Hamburguesas',unit:'pieza',price:null,cost:null,detail:'Separar variantes y modelos que tengan distinto precio.'},
{id:'pap',name:'Papas a la francesa',unit:'porción',price:null,cost:null,detail:'Definir gramos y tamaño de presentación.'}],
sales:[],deliveries:[],purchases:[],waste:[],expenses:[],closings:[],openingStock:{mora:{},santacruz:{}},
tasks:seedTasks.map(t=>({id:t[0],phase:t[1],title:t[2],description:t[3],status:t[4],note:'',updatedAt:''})),
docs:seedDocs.map(d=>({id:d[0],title:d[1],description:d[2],category:d[3],status:d[4],url:'',note:'',updatedAt:''}))};}
let data;
let storageEnabled=true;
data=freshData();
function loadLocalHistory(){storageEnabled=true;try{const saved=localStorage.getItem(KEY);data=saved?JSON.parse(saved):freshData();if(!data||data.version!==1||!Array.isArray(data.products)||!Array.isArray(data.tasks)||!Array.isArray(data.sales))throw Error('Formato no válido');for(const k of ['deliveries','purchases','waste','expenses','closings','docs'])if(!Array.isArray(data[k]))data[k]=[];if(!data.openingStock)data.openingStock={mora:{},santacruz:{}};for(const b of BRANCHES)if(!data.openingStock[b.id])data.openingStock[b.id]={}}catch(err){data=freshData();storageEnabled=false;console.warn('Almacenamiento no disponible o datos dañados.')}}

const ui={page:'inicio',branch:'all',abastoTab:'compras',inventoryBranch:'mora',cashBranch:'mora',financeBranch:'all',salesBranch:'all'};
const authState={status:'initializing',configured:false,client:null,user:null,member:null,catalogSynced:false,lastCatalogRead:null,epoch:0,subscription:null,initialization:null,validation:null,loginPending:false,blocked:false,salesProbe:null,remoteSales:[],salesLoaded:false,purchasesProbe:null,purchaseCatalog:{suppliers:[],items:[],locations:[]},remotePurchases:[],purchasesLoaded:false,operations:{},legalVersions:{}};
const posState={quantities:{},requestId:null};
function isEmployee(){return authState.member?.role==='employee'}
function isAdmin(){return ['owner','consultant'].includes(authState.member?.role)}
function requireAuthorized(){need(authState.status==='authenticated'&&authState.user&&validMember(authState.member,authState.user),'Acceso denegado: se requiere una membresía activa.');}
function requireAdmin(){requireAuthorized();need(isAdmin(),'Acceso denegado: se requiere una membresía administrativa activa.');}
function save(){throw Error('Captura suspendida: este módulo aún no tiene escrituras verificadas en Supabase. Los datos locales existentes se conservan.')}
function toast(text,type='success'){const root=document.getElementById('toast-zone');const el=document.createElement('div');el.className='toast '+(type==='error'?'error':'');el.textContent=text;root.appendChild(el);setTimeout(()=>el.remove(),4200)}
function setAuthMessage(message='',kind=''){const el=document.getElementById('auth-message');el.textContent=message;el.dataset.kind=kind}
function setAuthSubmitReady(ready){const submit=document.getElementById('auth-submit');submit.disabled=!ready;submit.setAttribute('aria-disabled',String(!ready))}
async function withAuthTimeout(operation){
  let timer;
  try{return await Promise.race([operation,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Se agotó el tiempo de verificación.')),15000)})])}
  finally{clearTimeout(timer)}
}
function clearSessionMemory(){
  authState.user=null;authState.member=null;authState.catalogSynced=false;authState.lastCatalogRead=null;authState.salesProbe=null;authState.remoteSales=[];authState.salesLoaded=false;authState.purchasesProbe=null;authState.purchaseCatalog={suppliers:[],items:[],locations:[]};authState.remotePurchases=[];authState.purchasesLoaded=false;authState.operations={};authState.legalVersions={};posState.quantities={};posState.requestId=null;
  data=freshData();BRANCHES=[];
  document.getElementById('auth-password').value='';
  document.getElementById('auth-email').value='';
  document.getElementById('toast-zone').replaceChildren();
  updateSessionChrome();
}
function setAuthStatus(status,message=''){
  authState.status=status;
  const authenticated=status==='authenticated';
  document.getElementById('app').hidden=!authenticated;
  document.getElementById('auth-gate').hidden=authenticated;
  document.getElementById('auth-gate').dataset.state=status;
  document.getElementById('auth-form').hidden=status!=='unauthenticated';
  document.getElementById('auth-progress').hidden=status!=='initializing';
  document.getElementById('auth-retry').hidden=!['error','unauthorized'].includes(status);
  document.getElementById('auth-title').textContent={initializing:'Verificando sesión segura…',unauthenticated:'Inicia sesión para continuar',authenticated:'Sesión autorizada',unauthorized:'Acceso denegado',error:'No se pudo verificar el acceso'}[status];
  setAuthMessage(message,['error','unauthorized'].includes(status)?'error':'');
  if(!authenticated){
    document.getElementById('dialog').close();
    document.getElementById('dialog-content').replaceChildren();
    document.getElementById('main-content').replaceChildren();
  }
  setAuthSubmitReady(status==='unauthenticated'&&!!authState.client&&!authState.loginPending);
}
function showAuthGate(message=''){setAuthStatus(authState.status==='authenticated'?'unauthenticated':authState.status,message)}
function showApplication(){requireAuthorized();setAuthStatus('authenticated')}
function setDataMode(text,title){const tag=document.getElementById('data-mode');tag.lastChild.textContent=' '+text;tag.title=title}
function updateSessionChrome(){const chip=document.getElementById('session-chip'),signOut=document.getElementById('sign-out');if(!authState.member){chip.textContent='';chip.hidden=true;signOut.hidden=true;return}chip.textContent=`${authState.member.display_name} · ${authState.member.role}`;chip.hidden=false;signOut.hidden=false;applyRoleNavigation();const employee=isEmployee();setDataMode(authState.catalogSynced?'Catálogo sincronizado':'Sesión segura',employee?'Panel operativo restringido a tu sucursal; la autorización final se aplica en PostgreSQL y RLS.':authState.catalogSynced?'Sucursales y productos se consultan con Supabase; los demás módulos siguen siendo locales.':'Sesión autenticada; los datos operativos siguen siendo locales.')}
function applyRoleNavigation(){const allowed=isEmployee()?new Set(['inicio','ventas','inventario','equipo']):null;document.querySelectorAll('#sidebar .nav-item').forEach(link=>{link.hidden=!!allowed&&!allowed.has(link.dataset.page)});document.querySelectorAll('#sidebar .nav-heading').forEach(heading=>{const nav=heading.nextElementSibling;heading.hidden=!!allowed&&(!nav||![...nav.querySelectorAll('.nav-item')].some(link=>!link.hidden));});}
function validMember(member,user){return !!(user&&member&&member.user_id===user.id&&member.active===true&&((['owner','consultant'].includes(member.role)&&member.branch_id===null)||(member.role==='employee'&&typeof member.branch_id==='string'&&member.branch_id.length>0)))}
function hydrateReadOnlyCatalog(branches,products){const validBranches=Array.isArray(branches)&&branches.length>0&&branches.every(b=>typeof b.id==='string'&&typeof b.name==='string'&&typeof b.location_description==='string'&&typeof b.active==='boolean');const validProducts=Array.isArray(products)&&products.every(p=>typeof p.id==='string'&&typeof p.name==='string'&&typeof p.unit==='string'&&typeof p.detail==='string'&&typeof p.active==='boolean'&&(p.sale_price===null||Number.isFinite(Number(p.sale_price))));if(!validBranches)throw Error('Las sucursales recibidas no tienen una estructura válida.');BRANCHES=branches.filter(b=>b.active).map(b=>({id:b.id,name:b.name,short:b.location_description}));if(validProducts){data.products=products.map(p=>({id:p.id,name:p.name,unit:p.unit,price:p.sale_price===null?null:Number(p.sale_price),cost:null,detail:p.detail,active:p.active}));authState.catalogSynced=true;authState.lastCatalogRead=new Date().toISOString()}else throw Error('El catálogo recibido no tiene una estructura válida.');}
async function refreshCatalog(){
  requireAdmin();const epoch=authState.epoch;
  const {data,error}=await authState.client.from('pw_products').select('id,name,unit,sale_price,detail,active,updated_at').order('id');
  if(epoch!==authState.epoch)throw Error('La sesión cambió durante la consulta.');
  requireAdmin();if(error)throw error;
  hydrateReadOnlyCatalog(BRANCHES.map(b=>({id:b.id,name:b.name,location_description:b.short,active:true})),data);
}
async function saveProductToSupabase(payload,id,form,submitButton){
  requireAdmin();
  if(!authState.catalogSynced||!authState.client)throw Error('No hay una conexión confirmada con el catálogo de Supabase.');
  if(form.dataset.saving==='true')return false;
  form.dataset.saving='true';
  const epoch=authState.epoch;
  if(submitButton){submitButton.disabled=true;submitButton.dataset.label=submitButton.textContent;submitButton.textContent='Guardando…'}
  try{
    // El servidor asigna el ID según el esquema de pw_products; uid() es solo para datos locales.
    const query=id
      ?authState.client.from('pw_products').update(payload).eq('id',id).select('id,name,unit,sale_price,detail,active,updated_at').maybeSingle()
      :authState.client.from('pw_products').insert(payload).select('id,name,unit,sale_price,detail,active,updated_at').single();
    const {data:written,error}=await query;
    if(epoch!==authState.epoch)throw Error('La sesión cambió durante el guardado. Verifica el catálogo al volver a entrar.');
    requireAdmin();
    if(error)throw error;
    if(!written||!written.id)throw Error('Supabase no confirmó el registro. Verifica el catálogo antes de reintentar.');
    try{
      await refreshCatalog();
    }catch(readError){
      throw Error('Supabase confirmó el guardado, pero falló la recarga. Actualiza el catálogo antes de volver a guardar: '+(readError.message||'error de lectura'));
    }
    const confirmed=data.products.find(row=>row.id===written.id);
    if(!confirmed)throw Error('Supabase confirmó el guardado, pero el producto no aparece en la recarga. Actualiza el catálogo antes de volver a guardar.');
    return true;
  }catch(error){
    if(form.dataset)form.dataset.saveError=error.message||'Error de Supabase';
    throw new Error(error.message||'No se pudo guardar en Supabase. Revisa los datos e inténtalo de nuevo.');
  }finally{
    form.dataset.saving='false';
    if(submitButton){submitButton.disabled=false;submitButton.textContent=submitButton.dataset.label||'Guardar producto'}
  }
}
async function authorizeUser(user,epoch=authState.epoch){
  const current=()=>epoch===authState.epoch&&!authState.blocked;
  const {data:member,error}=await authState.client.from('pw_members').select('user_id,display_name,role,branch_id,active').eq('user_id',user.id).maybeSingle();
  if(!current())return false;
  if(error)throw new Error('No se pudo validar tu membresía.');
  if(!validMember(member,user)){
    clearSessionMemory();authState.blocked=true;
    setAuthStatus('unauthorized','Se requiere una membresía activa con un rol autorizado.');
    await authState.client.auth.signOut({scope:'local'});
    return false;
  }
  const [branches,products]=await Promise.all([
    authState.client.from('pw_branches').select('id,name,location_description,active').order('id'),
    authState.client.from('pw_products').select('id,name,unit,sale_price,detail,active,updated_at').order('id')
  ]);
  if(!current())return false;
  if(branches.error||products.error)throw new Error('No fue posible consultar el catálogo autorizado.');
  // En un dispositivo compartido nunca hidratar el historial local de gerencia
  // dentro del proceso de un empleado. No se borra el respaldo antiguo.
  if(member.role==='employee')data=freshData();else loadLocalHistory();
  hydrateReadOnlyCatalog(branches.data,products.data);
  authState.user=user;authState.member=member;authState.status='authenticated';
  updateSessionChrome();render();showApplication();
  void verifyAuxiliaryModules(epoch);
  return true;
}
function handleAuthEvent(event,session){
  if(event==='SIGNED_OUT'){
    authState.epoch++;authState.blocked=true;clearSessionMemory();
    if(authState.status!=='unauthorized')setAuthStatus('unauthenticated','Sesión cerrada.');
    return;
  }
  // No llamar al SDK dentro del bloqueo interno de Auth.
  // INITIAL_SESSION se resuelve por initializeAuth y login por submitLogin.
  if(!['SIGNED_IN','TOKEN_REFRESHED','USER_UPDATED'].includes(event)||!session?.user||authState.blocked||authState.loginPending||authState.initialization)return;
  const epoch=authState.epoch;
  setTimeout(()=>{if(epoch===authState.epoch&&!authState.blocked&&!authState.loginPending)void verifySession()},0);
}
function verifySession(){
  if(authState.validation?.epoch===authState.epoch)return authState.validation.promise;
  const epoch=++authState.epoch;
  clearSessionMemory();setAuthStatus('initializing');
  const promise=(async()=>{
    try{
      const {data:result,error}=await withAuthTimeout(authState.client.auth.getUser());
      if(epoch!==authState.epoch||authState.blocked)return false;
      if(error){
        if(error.name==='AuthSessionMissingError'||error.status===401||error.status===403){setAuthStatus('unauthenticated','Inicia sesión con tu cuenta autorizada.');return false}
        throw error;
      }
      if(!result?.user){setAuthStatus('unauthenticated');return false}
      return await withAuthTimeout(authorizeUser(result.user,epoch));
    }catch{
      if(epoch===authState.epoch&&!authState.blocked){authState.epoch++;clearSessionMemory();setAuthStatus('error','No se pudo verificar tu sesión. Revisa la conexión y vuelve a intentar.');}
      return false;
    }finally{if(authState.validation?.epoch===epoch)authState.validation=null}
  })();
  authState.validation={epoch,promise};return promise;
}
function initializeAuth(){
  if(authState.initialization)return authState.initialization;
  const promise=(async()=>{
    authState.blocked=false;setAuthStatus('initializing');
    try{
      authState.configured=getSupabaseConfigurationStatus().configured;
      if(!authState.configured)throw Error('Configuración no disponible');
      authState.client=await withAuthTimeout(getSupabaseClient());
      if(!authState.subscription)authState.subscription=authState.client.auth.onAuthStateChange(handleAuthEvent).data.subscription;
      await verifySession();
    }catch{clearSessionMemory();setAuthStatus('error','No se pudo iniciar la conexión segura. Revisa la configuración y vuelve a intentar.');}
  })();
  authState.initialization=promise;
  void promise.finally(()=>{if(authState.initialization===promise)authState.initialization=null});
  return promise;
}
async function logout(){
  const client=authState.client;
  authState.blocked=true;authState.epoch++;
  clearSessionMemory();setAuthStatus('initializing','Cerrando sesión…');
  try{
    const result=await withAuthTimeout(client.auth.signOut());
    if(result?.error)throw result.error;
    setAuthStatus('unauthenticated','Sesión cerrada.');
  }catch{setAuthStatus('error','El acceso en esta página está bloqueado. No se pudo confirmar el cierre de sesión; vuelve a intentar.');}
}
function loginErrorMessage(error){const code=String(error?.code||'').toLowerCase(),message=String(error?.message||'').toLowerCase();if(code==='email_not_confirmed'||message.includes('email not confirmed'))return 'Confirma tu correo electrónico antes de iniciar sesión.';if(code==='invalid_credentials'||message.includes('invalid login credentials'))return 'Correo o contraseña incorrectos.';if(message.includes('fetch')||message.includes('network')||message.includes('failed to fetch'))return 'No fue posible conectar con Plebes Wings. Revisa tu conexión e inténtalo de nuevo.';return 'No fue posible iniciar sesión. Inténtalo de nuevo o solicita acceso.'}
async function submitLogin(){
  const submit=document.getElementById('auth-submit'),emailInput=document.getElementById('auth-email'),passwordInput=document.getElementById('auth-password');
  if(!authState.client||submit.disabled||authState.loginPending)return;
  const email=emailInput.value.trim(),password=passwordInput.value;
  if(!email||!password){setAuthMessage('Ingresa tu correo y contraseña.','error');return}
  authState.loginPending=true;authState.blocked=false;
  const epoch=++authState.epoch;setAuthStatus('initializing');
  let signedIn=false;
  try{
    const {data:result,error}=await withAuthTimeout(authState.client.auth.signInWithPassword({email,password}));
    if(epoch!==authState.epoch||authState.blocked)return;
    if(error)throw error;
    if(!result?.user)throw Error('No se recibió una sesión válida.');
    signedIn=true;
    await withAuthTimeout(authorizeUser(result.user,epoch));
  }catch(error){
    if(epoch===authState.epoch&&!authState.blocked){authState.epoch++;authState.blocked=true;clearSessionMemory();setAuthStatus(signedIn?'error':'unauthenticated',signedIn?'No se pudo verificar tu acceso. Vuelve a intentar.':loginErrorMessage(error));}
  }finally{
    passwordInput.value='';authState.loginPending=false;
    setAuthSubmitReady(authState.status==='unauthenticated'&&!!authState.client);
  }
}
function branchFilter(value,handler,all=true){return `<select class="select branch-filter" aria-label="Filtrar sucursal" data-change="${handler}">${all?`<option value="all" ${value==='all'?'selected':''}>Ambas sucursales</option>`:''}${BRANCHES.map(b=>`<option value="${sanitize(b.id)}" ${value===b.id?'selected':''}>${sanitize(b.name)}</option>`).join('')}</select>`}
function pageTitle(title,desc,actions=''){return `<div class="page-titlebar"><div><h1>${title}</h1><p>${desc}</p></div>${actions?`<div class="title-actions">${actions}</div>`:''}</div>`}
function button(label,action,variant='primary',icon='plus',extra=''){return `<button type="button" class="btn btn-${variant}" data-action="${action}" ${extra}>${I(icon)} ${label}</button>`}
function pill(status){const kind=status==='Validado'||status==='Publicado'?'success':status==='En curso'||status==='Borrador'?'progress':status==='Pendiente de revisión'?'warn':'pending';return `<span class="pill pill-${kind}">${sanitize(status)}</span>`}
function empty(title,detail,icon='clipboard'){return `<div class="empty"><span class="empty-icon">${I(icon,23)}</span><div class="empty-title">${sanitize(title)}</div><p>${sanitize(detail)}</p></div>`}
function sum(arr,fn){return arr.reduce((acc,item)=>acc+number(fn(item)),0)}
function byBranch(items,branch){return branch==='all'?items:items.filter(x=>x.branch===branch)}
function findProduct(id){return data.products.find(p=>p.id===id)}
function productsReady(){return data.products.some(p=>p.price!==null&&p.price!==undefined&&number(p.price)>0)}
function numberInput(name,label,{min=0,step='0.01',required=true,value='',placeholder='',hint=''}={}){return `<div class="form-field"><label for="f-${sanitize(name)}">${label}</label><input id="f-${sanitize(name)}" type="number" name="${sanitize(name)}" min="${min}" step="${step}" value="${sanitize(value)}" placeholder="${sanitize(placeholder)}" ${required?'required':''}>${hint?`<span class="form-hint">${hint}</span>`:''}</div>`}
function textInput(name,label,{required=true,value='',placeholder='',type='text',hint='',max=180}={}){return `<div class="form-field"><label for="f-${sanitize(name)}">${label}</label><input id="f-${sanitize(name)}" type="${type}" name="${sanitize(name)}" maxlength="${max}" value="${sanitize(value)}" placeholder="${sanitize(placeholder)}" ${required?'required':''}>${hint?`<span class="form-hint">${hint}</span>`:''}</div>`}
function selectInput(name,label,options,value){return `<div class="form-field"><label for="f-${sanitize(name)}">${label}</label><select id="f-${sanitize(name)}" name="${sanitize(name)}" required>${options.map(o=>`<option value="${sanitize(o[0])}" ${o[0]===value?'selected':''}>${sanitize(o[1])}</option>`).join('')}</select></div>`}
function branchInput(value='mora'){if(isEmployee()){const branch=authState.member?.branch_id;const label=branchName(branch);return `<input type="hidden" name="branch" value="${sanitize(branch)}"><div class="form-field"><span class="label">Sucursal</span><div class="mini-note">${sanitize(label)} · asignada a tu membresía</div></div>`}return selectInput('branch','Sucursal',BRANCHES.map(b=>[b.id,b.name]),value)}
function dateInput(value=localISO()){return textInput('date','Fecha',{type:'date',value})}
function modal(title,desc,content,submitFn,label='Guardar registro',setup){
  requireAdmin();
  if(!['Añadir presentación','Editar producto'].includes(title)){
    toast('Captura suspendida: este módulo aún no tiene escrituras verificadas en Supabase.','error');
    return;
  }
  const dlg=document.getElementById('dialog');
  const target=document.getElementById('dialog-content');
  target.innerHTML=`<form id="modal-form"><div class="modal-header"><div><h2>${title}</h2><p>${desc}</p></div><button type="button" class="icon-button" data-modal-close aria-label="Cerrar">${I('x')}</button></div><div class="modal-body">${content}<p class="caption" id="modal-error" role="alert" hidden></p></div><div class="modal-footer"><button type="button" class="btn btn-ghost" data-modal-close>Cancelar</button><button type="submit" class="btn btn-primary">${I('check')} ${label}</button></div></form>`;
  target.querySelectorAll('[data-modal-close]').forEach(n=>n.addEventListener('click',()=>{if(form.dataset.saving!=='true')dlg.close()}));
  const form=target.querySelector('#modal-form');
  form.addEventListener('submit',async e=>{
    e.preventDefault();
    if(form.dataset.saving==='true')return;
    const errorBox=form.querySelector('#modal-error');
    errorBox.hidden=true;
    try{
      const valid=await submitFn(new FormData(form),form);
      if(valid===true){dlg.close();render();toast('Guardado correctamente en Supabase.')}
    }catch(err){
      console.error('No se pudo completar la operación.');
      errorBox.textContent=err.message||'No se pudo guardar en Supabase.';
      errorBox.hidden=false;
      toast(errorBox.textContent,'error');
    }
  });
  dlg.showModal();
  if(setup)setup(form);
}
function need(condition,message){if(!condition)throw Error(message)}
function isDate(s){return /^\d{4}-\d{2}-\d{2}$/.test(s)}
function validAmount(v){return Number.isFinite(v)&&v>=0}
function moneySafe(v){return Math.round((number(v)+Number.EPSILON)*100)/100}
function dateAndBranch(fd){const date=String(fd.get('date')||'');const branch=String(fd.get('branch')||'');need(isDate(date),'Selecciona una fecha válida.');need(BRANCHES.some(b=>b.id===branch),'Selecciona una sucursal.');return {date,branch}}
function sortedRows(items,n=9){return sortByDate(items).slice(0,n)}
function latestOps(){const ops=[...data.sales.filter(x=>!x.voidedAt).map(x=>({date:x.date,title:`Venta ${x.ticket}`,note:branchName(x.branch)+' · '+money(x.total),icon:'shopping-bag'})),...data.deliveries.map(x=>({date:x.date,title:`Entrega de ${productName(x.productId)}`,note:branchName(x.branch)+' · '+integer(x.quantity)+' unidades',icon:'truck'})),...data.closings.map(x=>({date:x.date,title:'Cierre de caja',note:branchName(x.branch)+' · '+fmtDate(x.date),icon:'wallet'}))];return sortByDate(ops).slice(0,5)}
function salesByDay(date,branch){return data.sales.filter(s=>!s.voidedAt&&s.date===date&&s.branch===branch)}
function remoteSalesTotals(branch='all'){
  const rows=byBranch(authState.remoteSales.filter(s=>!s.voidedAt),branch);
  return {orders:rows.length,total:sum(rows,s=>s.total),units:sum(rows,s=>sum(s.items,i=>i.qty)),
    cash:sum(rows,s=>sum(s.payments.filter(p=>p.method==='efectivo'),p=>p.amount)),
    card:sum(rows,s=>sum(s.payments.filter(p=>p.method==='tarjeta'),p=>p.amount)),
    transfer:sum(rows,s=>sum(s.payments.filter(p=>p.method==='transferencia'),p=>p.amount))};
}
function salesTotals(branch='all'){const s=byBranch(data.sales.filter(x=>!x.voidedAt),branch);return {orders:s.length,total:sum(s,x=>x.total),units:sum(s,x=>sum(x.items,i=>i.qty)),cash:sum(s,x=>sum(x.payments.filter(p=>p.method==='efectivo'),p=>p.amount)),card:sum(s,x=>sum(x.payments.filter(p=>p.method==='tarjeta'),p=>p.amount)),transfer:sum(s,x=>sum(x.payments.filter(p=>p.method==='transferencia'),p=>p.amount))}}
function cashExpected(date,branch,float=0,withdrawals=0){const todaySales=salesByDay(date,branch);const cash=sum(todaySales,x=>sum(x.payments.filter(p=>p.method==='efectivo'),p=>p.amount));const cashOut=sum(data.expenses.filter(e=>e.date===date&&e.branch===branch&&e.fromCash),e=>e.amount);return {cash,cashOut,total:moneySafe(float+cash-cashOut-withdrawals)}}
function stockValue(branch,productId,untilDate=null){const base=data.openingStock?.[branch]?.[productId];if(base===null||base===undefined||base==='')return null;const validDate=x=>!untilDate||x.date<=untilDate;const received=sum(data.deliveries.filter(x=>x.branch===branch&&x.productId===productId&&validDate(x)),x=>x.quantity);const sold=sum(data.sales.filter(x=>!x.voidedAt&&x.branch===branch&&validDate(x)),x=>sum(x.items.filter(i=>i.productId===productId),i=>i.qty));const waste=sum(data.waste.filter(x=>x.branch===branch&&x.productId===productId&&validDate(x)),x=>x.quantity);return {base:number(base),received,sold,waste,expected:number(base)+received-sold-waste}}
function closeCompleteness(){const dates=new Set(data.closings.map(c=>c.date));const allDays=[...dates].filter(date=>BRANCHES.every(b=>data.closings.some(c=>c.date===date&&c.branch===b.id))).sort();return {days:allDays.length,dates:allDays,partial:dates.size-allDays.length,records:data.closings.length}}
function safeURL(v){try{const u=new URL(v);return ['https:','http:'].includes(u.protocol)?u.href:''}catch{return ''}}
function renderHome(){const totals=authState.salesLoaded?remoteSalesTotals(ui.branch):salesTotals(ui.branch),counts=closeCompleteness(),done=data.tasks.filter(t=>t.status==='Validado').length,progress=Math.round(100*done/(data.tasks.length||1));const unpriced=data.products.filter(p=>p.price===null||p.price===undefined);const activity=latestOps();let bybranches=BRANCHES.map(b=>({...b,...(authState.salesLoaded?remoteSalesTotals(b.id):salesTotals(b.id))}));const allRevenue=sum(bybranches,b=>b.total);return `
<section class="hero"><div class="hero-copy"><p class="eyebrow">CENTRO DE OPERACIONES · PLEBES WINGS</p><h1>Un negocio que crece merece <span class="gradient-text">una operación bajo control.</span></h1><p>Dos puntos de venta. Un mismo método. Una ruta clara para delegar, medir y profesionalizar cada proceso.</p><div class="hero-actions">${button('Registrar venta','sale-new','primary','plus')}${button('Ver plan de trabajo','go-ruta','secondary','route')}</div></div><img class="hero-logo" src="assets/plebes-logo.png" alt="Logotipo original Plebes Wings"></section>
${localNotice()}
<div class="page-titlebar"><div><h2 style="margin:0 0 7px">Panorama operativo</h2><p>Ventas y tickets: Supabase al estar conectado. Jornadas y otros movimientos: historial local pendiente de migración.</p></div>${branchFilter(ui.branch,'home-branch')}</div>
<div class="grid grid-4" style="margin-bottom:23px">
${kpi('Ventas registradas',money(totals.total),'Ingresos brutos de pedidos','coins')}
${kpi('Pedidos registrados',integer(totals.orders),'Tickets capturados','shopping-bag','red')}
${kpi('Unidades vendidas',integer(totals.units),'Según cantidades por producto','package','blue')}
${kpi('Jornadas completas',`${counts.days} / 14`,'Con corte en las dos sucursales','calendar','green')}
</div>
<div class="grid grid-main" style="margin-bottom:24px">
<div class="card"><div class="section-heading"><h2>Desempeño por sucursal</h2><span class="pill">2 PUNTOS DE VENTA</span></div><div class="grid grid-2">${bybranches.map(b=>`<div class="card branch-card" style="padding:17px;background:#1e1f22"><div class="branch-head"><span class="branch-title">${I('store')} ${sanitize(b.name)}</span><span class="pill pill-pending">${b.id==='mora'?'01':'02'}</span></div><div class="branch-number mono">${money(b.total)}</div><span class="branch-sub">${integer(b.orders)} pedidos registrados</span><div class="branch-meter progress-track"><div class="progress-fill" style="width:${allRevenue>0?b.total/allRevenue*100:0}%"></div></div><span class="caption">${allRevenue>0?Math.round(b.total/allRevenue*100)+'% del total registrado':'Aún no hay ventas registradas'}</span></div>`).join('')}</div><div class="divider"></div><div class="section-heading"><h2>Distribución de cobros</h2><span class="muted xs">${money(totals.total)}</span></div>${[['Efectivo',totals.cash],['Tarjeta',totals.card],['Transferencia',totals.transfer]].map(([name,val])=>`<div class="metric-line"><span>${name}</span><strong>${money(val)}</strong></div><div class="mini-meter"><span style="width:${totals.total?val/totals.total*100:0}%"></span></div>`).join('')}</div>
<div class="card"><div class="section-heading"><h2>Avance del proyecto</h2><a href="#ruta" class="link xs">Ver toda la ruta</a></div><div class="flex between center" style="margin-bottom:10px"><span class="muted small">Entregables validados</span><strong>${done} de ${data.tasks.length}</strong></div><div class="progress-track"><div class="progress-fill" style="width:${progress}%"></div></div><div class="flex between center" style="margin-top:9px"><span class="caption">Progreso por tareas validadas</span><strong class="text-yellow">${progress}%</strong></div><div class="divider"></div><h3 style="margin-bottom:7px">Siguientes prioridades</h3><div class="list-group">${data.tasks.filter(t=>t.status!=='Validado').slice(0,4).map(t=>`<div class="list-row"><div class="row-left"><div class="step-number">${sanitize(t.phase)}</div><div><div class="list-title">${sanitize(t.title)}</div><div class="list-detail">${sanitize(t.description)}</div></div></div></div>`).join('')||`<p class="muted small">Todas las tareas están validadas.</p>`}</div></div></div>
<div class="grid grid-main"><div class="card"><div class="section-heading"><h2>Actividad reciente</h2><span class="pill pill-pending">Bitácora local</span></div>${activity.length?`<div class="list-group">${activity.map(x=>`<div class="list-row"><div class="row-left"><div class="step-number">${I(x.icon)}</div><div><div class="list-title">${sanitize(x.title)}</div><div class="list-detail">${sanitize(x.note)}</div></div></div><span class="caption no-wrap">${sanitize(fmtDate(x.date))}</span></div>`).join('')}</div>`:empty('Aún no hay movimientos','La primera venta, entrega o cierre aparecerá automáticamente en esta bitácora.','chart')}</div>
<div class="card"><div class="section-heading"><h2>Antes de iniciar el piloto</h2>${pill('En curso')}</div><div class="helper-steps">
${[['01','Configurar precios','Registrar precios reales y definir las presentaciones del menú.'],['02','Contar existencias','Establecer el inventario físico inicial por sucursal.'],['03','Capturar el primer día','Registrar compras, entregas, ventas y cierre en ambos puestos.']].map(([n,title,desc])=>`<div class="helper-step"><span class="step-number">${n}</span><div><strong>${title}</strong><p>${desc}</p></div></div>`).join('')}</div><div class="divider"></div>${unpriced.length?`<div class="mini-note" style="margin-bottom:13px">${I('alert')} Faltan precios de ${unpriced.length} producto(s). Es necesario configurarlos antes de registrar esas ventas.</div>`:''}<button class="btn btn-secondary" data-action="go-ajustes">${I('settings')} Configurar menú</button></div></div>`}
function kpi(title,value,note,icon,color=''){return `<article class="card kpi"><div class="kpi-icon ${color}">${I(icon,18)}</div><div class="kpi-meta">${title}</div><div class="kpi-value mono">${value}</div><div class="kpi-note">${note}</div></article>`}
function localNotice(){return `<div class="subtle-banner">${I("circle-info",20)} <div><strong>Operación en transición.</strong> Sucursales y catálogo: ${authState.catalogSynced?"lectura confirmada en Supabase":"sin lectura confirmada"}. Ventas: ${authState.salesLoaded?"datos sincronizados con Supabase":"pendientes de consulta"}. Compras, inventario, caja y finanzas sólo muestran información remota en sus pantallas operativas; las escrituras permanecen bloqueadas hasta que sus migraciones y permisos estén disponibles. <a href="#ajustes" class="link">Datos, respaldos y seguridad</a></div></div>`}
function renderRoadmap(){const counts=data.tasks.reduce((o,t)=>{o[t.status]=(o[t.status]||0)+1;return o},{'Validado':0,'En curso':0,'Pendiente':0});const pct=Math.round((counts['Validado']||0)*100/data.tasks.length);const phases=[['01','Diagnóstico y configuración','Punto de partida, menú y conteo inicial.','Antes del piloto'],['02','Piloto operativo','Compras, entregas, ventas, mermas, corte e higiene.','14 jornadas efectivas'],['03','Personas y estandarización','Manuales, formación, seguridad y documentación legal.','Tras validar el proceso'],['04','Escalamiento digital','Usuarios, sincronización, documentos y análisis más profundo.','Siguiente versión']];return `${pageTitle('Ruta del proyecto','Todos los frentes de trabajo y su avance verificable, visibles para los propietarios.',button('Exportar avance','export-json','ghost','download'))}
<div class="card" style="margin-bottom:18px"><div class="flex between center"><div><span class="eyebrow" style="margin-bottom:10px">TRANSFORMACIÓN OPERATIVA</span><h2 style="margin:0 0 7px">Del puesto familiar a una operación replicable.</h2><span class="muted small">El avance se actualiza al validar cada actividad, no al pasar los días.</span></div><strong style="font-size:35px;color:var(--yellow)">${pct}%</strong></div><div class="progress-track" style="margin-top:17px"><div class="progress-fill" style="width:${pct}%"></div></div><div class="flex gap12 wrap" style="margin-top:12px">${pill('Validado')} <span class="muted xs">${counts['Validado']||0}</span>${pill('En curso')} <span class="muted xs">${counts['En curso']||0}</span>${pill('Pendiente')} <span class="muted xs">${counts['Pendiente']||0}</span></div></div>
<div class="timeline">${phases.map(([n,title,desc,when])=>`<article class="timeline-card ${n==='02'?'current':''}"><div class="top"><span class="num">FASE ${n}</span>${n==='02'?`<span class="pill pill-progress">PILOTO PROPUESTO</span>`:''}</div><h3>${title}</h3><p>${desc}</p><div class="divider"></div><span class="when">${when}</span></article>`).join('')}</div>
<div class="section-heading"><h2>Plan de trabajo detallado</h2><span class="caption">Pulsa «Actualizar» para dejar evidencia del avance.</span></div>${phases.map(([n,title])=>`<div style="margin-bottom:24px"><div class="tag-line"><span class="inline-chip">FASE ${n}</span><strong>${title}</strong></div>${data.tasks.filter(t=>t.phase===n).map(t=>`<div class="task-card"><div><span class="task-badge">${sanitize(t.id.toUpperCase())}</span><h3>${sanitize(t.title)}</h3><p>${sanitize(t.description)}</p>${t.note?`<p style="margin-top:8px;color:#efc080">Nota: ${sanitize(t.note)}</p>`:''}</div><div class="flex center gap8 wrap">${pill(t.status)}<button class="mini-action" data-action="task-edit" data-id="${sanitize(t.id)}">Actualizar</button></div></div>`).join('')}</div>`).join('')}
<div class="card"><h3>Piloto de 14 jornadas: criterio de validación</h3><p class="section-intro">Cada jornada se considera completa cuando se registró el corte de caja de <strong>La Mora y Santa Cruz</strong> en la misma fecha. Además de completar 14 jornadas, hay que revisar las diferencias, los registros incompletos y el desempeño de la operación antes de afirmar que el proceso está listo para delegarse.</p><div class="grid grid-3">${[['Cortes capturados',String(data.closings.length)],['Jornadas de dos sucursales',String(closeCompleteness().days)+' / 14'],['Días con un solo corte',String(closeCompleteness().partial)]].map(([n,v])=>`<div class="kpi-simple"><label>${n}</label><strong>${v}</strong></div>`).join('')}</div><p class="caption" style="margin-top:12px">El sistema no comprueba automáticamente que una jornada tenga todos los comprobantes o que no existan incidencias sin resolver.</p></div>`}
function legalStatusLabel(id){
  const result=authState.legalVersions[id];
  if(!result)return 'Pendiente de comprobación';
  if(result.error)return 'Almacén privado no configurado';
  return result.count>0?`${result.count} versión(es) privada(s)`:'Pendiente de carga privada';
}
function renderLegalLibrary(){
  return `<section class="card" style="margin-top:20px"><div class="section-heading"><div><span class="eyebrow">CONTROL DOCUMENTAL INTERNO</span><h2>Documentos jurídicos y políticas existentes</h2></div><span class="pill">Acceso administrativo</span></div>
  <p class="section-intro">Se identificaron los documentos Word originales de Plebes Wings. Sus archivos no están incluidos en el repositorio público. Las versiones se almacenan en un bucket privado de Supabase Storage, accesible únicamente para administradores autorizados.</p>
  <div class="grid grid-3">${LEGAL_DOCUMENTS.map(doc=>`<article class="doc-card"><div class="doc-icon">${I('shield',21)}</div><span class="caption">${sanitize(doc.code)} · ${sanitize(doc.version)}</span><h3>${sanitize(doc.title)}</h3><p>${sanitize(doc.summary)}</p><div class="mini-note">${I('alert',14)} <span><strong>Antes de formalizar:</strong> ${sanitize(doc.pending)}</span></div><div class="doc-meta"><span class="caption">Archivo original: ${sanitize(doc.file)}</span></div><div class="doc-meta"><span class="caption">${sanitize(legalStatusLabel(doc.id))}</span></div><div class="doc-actions"><button class="mini-action" data-action="legal-open" data-id="${sanitize(doc.id)}">Consultar versión privada</button><button class="mini-action" data-action="legal-upload" data-id="${sanitize(doc.id)}">Cargar versión</button></div></article>`).join('')}</div>
  <p class="caption" style="margin-top:15px">Los documentos conservan campos por completar, deben pasar revisión jurídica y requieren aprobación antes de firma o difusión. La garantía comercial «¿Sin ticket? Tu pedido es gratis» no está activa mientras no se implementen el registro de tickets, reclamaciones y reembolsos.</p></section>`;
}
async function refreshRemoteSales(epoch=authState.epoch){
  requireAuthorized();
  const {data:rows,error}=await authState.client.from('pw_sales')
    .select('id,branch_id,sale_date,ticket,status,void_reason,voided_at,note,created_at,pw_sale_lines(id,product_id,quantity,unit_price,line_total),pw_sale_payments(id,method,amount,reference)')
    .order('created_at',{ascending:false}).limit(300);
  if(epoch!==authState.epoch||authState.status!=='authenticated')return false;
  if(error)throw Error('No se pudo recuperar el historial de ventas de Supabase: '+error.message);
  if(!Array.isArray(rows))throw Error('El servidor no devolvió una lista de ventas válida.');
  authState.remoteSales=rows.map(row=>{
    const items=Array.isArray(row.pw_sale_lines)?row.pw_sale_lines.map(line=>({productId:line.product_id,qty:Number(line.quantity),unitPrice:Number(line.unit_price)})):[];
    const payments=Array.isArray(row.pw_sale_payments)?row.pw_sale_payments.map(pay=>({method:pay.method,amount:Number(pay.amount),reference:pay.reference||''})):[];
    return {id:row.id,date:row.sale_date,branch:row.branch_id,ticket:row.ticket,items,payments,
      total:items.reduce((n,item)=>n+item.qty*item.unitPrice,0),note:row.note||'',createdAt:row.created_at,
      reference:payments.map(pay=>pay.reference).filter(Boolean).join(', '),
      voidedAt:row.status==='void'?(row.voided_at||row.created_at):null,voidReason:row.status==='void'?(row.void_reason||'Anulada en Supabase'):'',source:'supabase'};
  });
  authState.salesLoaded=true;
  return true;
}
async function verifyAuxiliaryModules(epoch){
  if(epoch!==authState.epoch||authState.status!=='authenticated')return;
  try{const probe=await probeSalesTables(authState.client);if(epoch===authState.epoch&&authState.status==='authenticated'){authState.salesProbe=probe;if(probe.serverReady){try{await refreshRemoteSales(epoch)}catch(error){authState.salesProbe={...probe,serverReady:false,error:error.message};}}if(location.hash==='#ventas'||(isEmployee()&&location.hash==='#inicio'))render();}}
  catch{if(epoch===authState.epoch)authState.salesProbe={salesReadable:false,linesReadable:false,serverReady:false,error:'No se pudo comprobar el módulo'};}
  try{const probe=await probePurchaseModule(authState.client);if(epoch===authState.epoch&&authState.status==='authenticated'){authState.purchasesProbe=probe;authState.purchaseCatalog=probe.catalog;authState.remotePurchases=probe.documents;authState.purchasesLoaded=true;if(location.hash==='#abasto')render();}}
  catch(error){if(epoch===authState.epoch){authState.purchasesProbe={serverReady:false,error:error.message||'No se pudo comprobar compras.'};authState.purchasesLoaded=false;}}
  try{await refreshOperations(epoch)}catch(error){if(epoch===authState.epoch)authState.operations={loadError:error.message}}
  if(isEmployee())return; // No consultar almacenamiento legal privado con JWT de empleado.
  for(const doc of LEGAL_DOCUMENTS){
    if(epoch!==authState.epoch||authState.status!=='authenticated')return;
    try{const files=await listLegalVersions(authState.client,doc.id);if(epoch===authState.epoch)authState.legalVersions[doc.id]={count:files.length};}
    catch{if(epoch===authState.epoch)authState.legalVersions[doc.id]={error:true};}
  }
  if(epoch===authState.epoch&&location.hash==='#documentos')render();
}
async function openPrivateLegalDocument(id){
  requireAdmin();if(!findLegalDocument(id))throw Error('Documento no reconocido.');
  const epoch=authState.epoch;
  try{const url=await signLegalDocument(authState.client,id);if(epoch!==authState.epoch)return;requireAdmin();
    const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener noreferrer';document.body.appendChild(a);a.click();a.remove();
  }catch(e){if(epoch===authState.epoch)toast(e.message||'No se pudo abrir la versión privada.','error');}
}
async function receivePrivateLegalDocument(id,file){
  requireAdmin();if(!findLegalDocument(id))throw Error('Documento no reconocido.');
  const epoch=authState.epoch;
  try{await uploadLegalDocument(authState.client,id,file);if(epoch!==authState.epoch)return;requireAdmin();
    const versions=await listLegalVersions(authState.client,id);authState.legalVersions[id]={count:versions.length};render();toast('Archivo privado cargado y verificado en Supabase Storage.');
  }catch(e){if(epoch===authState.epoch)toast(e.message||'No se pudo cargar el documento.','error');}
}
function renderDocuments(){const count=data.docs.filter(d=>d.status==='Publicado').length;return `${pageTitle('Biblioteca de entregables','Aquí se publicará qué estamos desarrollando, qué se está revisando y cuáles documentos ya fueron aprobados.','<button type="button" class="btn btn-secondary" disabled>Nuevas fichas suspendidas</button>')}
<div class="grid grid-3" style="margin-bottom:21px">${kpi('Documentos previstos',data.docs.length,'Matriz de entregables','files')}${kpi('Publicados',count,'Con vínculo de consulta registrado','check','green')}${kpi('Pendientes o en revisión',data.docs.length-count,'Trabajo documental en proceso','clock','red')}</div>
<div class="subtle-banner">${I('lock')} <div><strong>Regla de seguridad:</strong> los documentos confidenciales, contratos con datos personales, fórmulas y recetas secretas no deben publicarse en repositorios abiertos. En esta versión los enlaces se guardan localmente; los documentos legales ya disponen de almacén privado con permisos.</div></div>
<div class="grid grid-3">${data.docs.map(d=>`<article class="doc-card"><div class="doc-icon">${I(d.category==='Legal'?'shield':d.category==='Personal'?'users':d.category==='Finanzas'?'wallet':'files',21)}</div><div class="flex center between" style="margin-bottom:10px"><span class="caption">${sanitize(d.category.toUpperCase())}</span>${pill(d.status)}</div><h3>${sanitize(d.title)}</h3><p>${sanitize(d.description)}</p>${d.note?`<div class="mini-note" style="margin-bottom:10px">${sanitize(d.note)}</div>`:''}<div class="doc-meta"><span class="caption">${d.updatedAt?'Actualizado: '+sanitize(d.updatedAt):'Por documentar'}</span></div><div class="doc-actions"><button class="mini-action" disabled title="Pendiente de migración a Supabase">Editar avance suspendido</button>${safeURL(d.url)?`<a href="${sanitize(safeURL(d.url))}" target="_blank" rel="noopener noreferrer">Ver documento ${I('external',12)}</a>`:''}</div></article>`).join('')}</div>
${renderLegalLibrary()}<div class="card" style="margin-top:20px"><h3>Biblioteca de entregables en transición</h3><p class="section-intro">Los registros históricos del navegador son de consulta. Su edición permanece suspendida hasta contar con persistencia autorizada. Los documentos jurídicos se gestionan por separado en Storage privado.</p></div>`}
function table(headers,rows,colspan){return `<div class="table-wrap"><table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows||`<tr><td colspan="${colspan||headers.length}" class="table-empty">No hay registros todavía.</td></tr>`}</tbody></table></div>`}
function renderSales(){
  const live=!!(authState.salesProbe?.serverReady&&authState.salesLoaded&&SALES_WRITE_ENABLED);
  const source=authState.salesLoaded?authState.remoteSales:[];
  const visibleBranch=isEmployee()?authState.member.branch_id:ui.salesBranch;
  const selected=byBranch(source,visibleBranch);
  const valid=selected.filter(x=>!x.voidedAt),total=sum(valid,x=>x.total),orders=valid.length;
  const state=live?'Conectado: los tickets y pagos se registran en Supabase.':'Captura bloqueada hasta comprobar permisos y consulta de ventas.';
  const action=live?button(isEmployee()?'Tomar pedido':'Nueva venta','sale-new','primary','plus'):'<button class="btn btn-secondary" disabled>Registro no disponible</button>';
  return `${pageTitle('Ventas y pedidos','Tickets registrados de forma segura por sucursal.',action)}
  <div class="subtle-banner">${I('shield')} <div><strong>${state}</strong> ${live?'Se confirma cada venta completa en el servidor. No se emite CFDI.':sanitize(authState.salesProbe?.error||'Comprobando acceso al sistema de ventas.')} Los registros locales históricos permanecen en el respaldo JSON.</div></div>
  ${!productsReady()?`<div class="subtle-banner">${I('alert')} <div>${isEmployee()?'No hay productos activos con precios oficiales. Solicita apoyo al responsable.':'Antes de vender, captura los precios reales de productos activos en <a href="#ajustes">Menú y configuración</a>.'}</div></div>`:''}
  <div class="grid grid-3" style="margin-bottom:19px">${kpi('Ventas registradas',money(total),'Tickets activos en Supabase','coins')}${kpi('Pedidos',integer(orders),'Tickets activos','shopping-bag','blue')}${kpi('Ticket promedio',orders?money(total/orders):money(0),'Importe medio por pedido','chart','green')}</div>
  <div class="card table-card"><div class="table-top"><div><h3>Historial en Supabase</h3><p>Los pagos mixtos se desglosan al abrir cada ticket.</p></div>${isEmployee()?`<span class="inline-chip">${sanitize(branchName(visibleBranch))}</span>`:branchFilter(ui.salesBranch,'sales-branch')}</div>${table(['Fecha','Ticket','Sucursal','Productos','Forma de pago','Total',''],sortedRows(selected,300).map(s=>`<tr><td>${sanitize(fmtDate(s.date))}</td><td><strong>${sanitize(s.ticket)}</strong>${s.voidedAt?'<div class="caption text-red">ANULADO</div>':''}</td><td>${sanitize(branchName(s.branch))}</td><td>${s.items.map(i=>integer(i.qty)+' × '+sanitize(productName(i.productId))).join('<div style="margin-top:3px"></div>')}</td><td>${s.payments.length>1?'Mixto':sanitize(methodName(s.payments[0]?.method||''))}</td><td class="mono"><strong>${money(s.total)}</strong></td><td><button class="mini-action" data-action="sale-detail" data-id="${sanitize(s.id)}">Detalle</button></td></tr>`).join(''))}</div><p class="caption" style="margin-top:12px">El sistema mantiene el precio de venta registrado en cada partida. Ticket comercial; no sustituye una factura CFDI.</p>`;
}
function renderLegacyAbasto(){const tabs=[['entregas','Entregas a puestos'],['compras','Compras centralizadas'],['mermas','Mermas y pérdidas']];let body='';if(ui.abastoTab==='entregas'){body=`<div class="grid grid-3" style="margin-bottom:16px">${kpi('Entregas registradas',integer(data.deliveries.length),'Movimientos entre producción y sucursal','truck')}${kpi('Porciones entregadas',integer(sum(data.deliveries,x=>x.quantity)),'Según unidades estándar','package','green')}${kpi('Sucursales',2,'Controles independientes','store','blue')}</div><div class="card table-card"><div class="table-top"><div><h3>Remisiones a sucursales</h3><p>La cantidad recibida es la base del inventario.</p></div>${button('Registrar entrega','delivery-new','primary','plus')}</div>${table(['Fecha','Sucursal','Producto','Cantidad','Lote / remisión','Entregó','Recibió'],sortedRows(data.deliveries,120).map(x=>`<tr><td>${sanitize(fmtDate(x.date))}</td><td>${sanitize(branchName(x.branch))}</td><td>${sanitize(productName(x.productId))}</td><td class="mono">${integer(x.quantity)}</td><td>${sanitize(x.lot||'—')}</td><td>${sanitize(x.deliveredBy||'—')}</td><td>${sanitize(x.receivedBy||'—')}</td></tr>`).join(''))}</div>`}
if(ui.abastoTab==='compras'){body=`<div class="grid grid-3" style="margin-bottom:16px">${kpi('Total de compras',money(sum(data.purchases,x=>x.total)),'Erogaciones registradas','coins')}${kpi('Movimientos',integer(data.purchases.length),'Comprobantes de compra','clipboard','blue')}${kpi('Proveedores distintos',integer(new Set(data.purchases.map(p=>p.vendor.toLowerCase())).size),'Según capturas','store','green')}</div><div class="card table-card"><div class="table-top"><div><h3>Compras de insumos</h3><p>Central de Abastos, pollerías y otros proveedores.</p></div>${button('Registrar compra','purchase-new','primary','plus')}</div>${table(['Fecha','Proveedor','Insumo','Cantidad','Costo unitario','Total','Método'],sortedRows(data.purchases,120).map(x=>`<tr><td>${sanitize(fmtDate(x.date))}</td><td>${sanitize(x.vendor)}</td><td>${sanitize(x.item)}</td><td>${integer(x.quantity)} ${sanitize(x.unit)}</td><td class="mono">${money(x.unitCost)}</td><td class="mono">${money(x.total)}</td><td>${sanitize(methodName(x.method))}</td></tr>`).join(''))}</div>`}
if(ui.abastoTab==='mermas'){body=`<div class="card table-card"><div class="table-top"><div><h3>Registro de mermas</h3><p>Separar producto vendido, desperdiciado, caducado o perdido.</p></div>${button('Registrar merma','waste-new','primary','plus')}</div>${table(['Fecha','Sucursal','Producto','Cantidad','Motivo','Observación'],sortedRows(data.waste,120).map(x=>`<tr><td>${sanitize(fmtDate(x.date))}</td><td>${sanitize(branchName(x.branch))}</td><td>${sanitize(productName(x.productId))}</td><td>${integer(x.quantity)}</td><td>${sanitize(x.reason)}</td><td>${sanitize(x.note||'—')}</td></tr>`).join(''))}</div>`}
return `${pageTitle('Compras y abastecimiento','Cada producto debe seguirse desde la compra hasta la entrega en la sucursal.')}
<div class="tabbar" role="tablist" aria-label="Tipo de movimiento">${tabs.map(([id,name])=>`<button class="tab ${ui.abastoTab===id?'active':''}" role="tab" aria-selected="${ui.abastoTab===id}" data-action="abasto-tab" data-id="${id}">${name}</button>`).join('')}</div><div class="tab-panel">${body}</div><div class="mini-note" style="margin-top:17px">${I('circle-info')} Una compra de 20 kg de pollo no equivale automáticamente a 20 porciones. La conversión y el rendimiento se definirán después de fijar las fichas técnicas. No registrar aquí recetas, proporciones de mezclas o fórmulas secretas.</div>`}
function purchaseStatus(status){return ({draft:'Borrador',confirmed:'Confirmada',received:'Recibida',void:'Anulada'})[status]||status}
function purchaseDocumentRows(){return sortedRows(authState.remotePurchases,200).map(p=>`<tr><td>${sanitize(fmtDate(p.date))}<div class="caption">${sanitize(p.code)}</div></td><td>${sanitize(p.supplier)}</td><td>${sanitize(p.location)}</td><td>${p.lines.map(line=>`${sanitize(line.name)} · ${line.quantity} ${sanitize(line.unit)}`).join('<br>')}</td><td class="mono">${money(p.total)}</td><td>${sanitize(purchaseStatus(p.status))}</td><td>${p.status==='draft'?button('Confirmar','purchase-confirm','secondary','check',`data-id="${sanitize(p.id)}"`):p.status==='confirmed'?button('Recibir','purchase-receive','primary','package',`data-id="${sanitize(p.id)}"`):''}${authState.member?.role==='owner'&&p.status!=='received'&&p.status!=='void'?button('Anular','purchase-void','danger','x',`data-id="${sanitize(p.id)}"`):''}</td></tr>`).join('')}
function renderAbasto(){
  if(ui.abastoTab!=='compras')return `${pageTitle('Abasto y mermas','Gestión centralizada en Supabase.')}<div class="tabbar">${[['entregas','Entregas a puestos'],['compras','Compras centralizadas'],['mermas','Mermas y pérdidas']].map(([id,name])=>`<button class="tab ${ui.abastoTab===id?'active':''}" data-action="abasto-tab" data-id="${id}">${name}</button>`).join('')}</div><div class="subtle-banner">${I('circle-info')} Esta pantalla no muestra el historial local como datos oficiales. ${ui.abastoTab==='mermas'?'Las mermas se registran desde Inventario y mermas.':'Las entregas entre ubicaciones se registran desde Inventario → Traspasar inventario.'}</div><div class="card" style="margin-top:16px;padding:22px"><h3>${ui.abastoTab==='mermas'?'Registro de mermas':'Entregas a sucursales'}</h3><p class="section-intro">${ui.abastoTab==='mermas'?'Para documentar pérdidas, selecciona una ubicación, un artículo y la cantidad exacta en Inventario.':'Para entregar mercancía desde almacén central a una sucursal, utiliza la opción Traspasar inventario. El movimiento queda registrado en Supabase.'}</p><a class="btn btn-primary" href="#inventario">${I('arrow-right')} Abrir Inventario y mermas</a></div>`;
  const live=Boolean(PURCHASE_WRITE_ENABLED&&authState.purchasesProbe?.serverReady&&authState.purchasesLoaded);
  const purchaseCatalog=authState.purchaseCatalog||{suppliers:[],items:[],locations:[]};
  const hasCatalog=!!(purchaseCatalog.suppliers?.length&&purchaseCatalog.items?.length&&purchaseCatalog.locations?.length);
  const documents=authState.remotePurchases, active=documents.filter(p=>p.status!=='void');
  const action=live&&hasCatalog?button('Registrar compra','purchase-new','primary','plus'):`<button class="btn btn-secondary" disabled>${live?'Agrega proveedor e insumo':'Compras en verificación'}</button>`;
  return `${pageTitle('Compras y abastecimiento','Documentos de compra con proveedor, partidas y recepción controlada.',action+' '+button('Nuevo proveedor','supplier-new','secondary','plus')+' '+button('Nuevo insumo','inventory-item-new','secondary','plus'))}
  <div class="tabbar" role="tablist" aria-label="Tipo de movimiento">${[['entregas','Entregas a puestos'],['compras','Compras centralizadas'],['mermas','Mermas y pérdidas']].map(([id,name])=>`<button class="tab ${ui.abastoTab===id?'active':''}" role="tab" aria-selected="${ui.abastoTab===id}" data-action="abasto-tab" data-id="${id}">${name}</button>`).join('')}</div>
  <div class="subtle-banner">${I('shield')} <div><strong>${live?'Conectado a Supabase.':'Captura bloqueada.'}</strong> ${live?(hasCatalog?'Los borradores, confirmaciones y recepciones se registran por RPC; no hay escritura directa desde el navegador. Las recepciones confirmadas generan entradas de inventario por artículo mediante la migración 09.':'Conexión operativa. Agrega al menos un proveedor y un insumo para poder registrar una compra.'):sanitize(authState.purchasesProbe?.error||'Comprobando permisos y catálogos de compras.')}</div></div>
  <div class="grid grid-3" style="margin:16px 0">${kpi('Compras activas',money(sum(active,p=>p.total)),'Sin documentos anulados','coins')}${kpi('Documentos',integer(documents.length),'Incluye borradores y anulaciones','clipboard','blue')}${kpi('Proveedores',integer(purchaseCatalog.suppliers?.length||0),'Proveedores activos del catálogo','store','green')}</div>
  <div class="card table-card"><div class="table-top"><div><h3>Compras de insumos</h3><p>Una compra puede contener múltiples partidas; su costo queda congelado en el documento.</p></div></div>${table(['Fecha / folio','Proveedor','Destino','Partidas','Total','Estado',''],purchaseDocumentRows())}</div>`;
}
function renderStock(){const current=ui.inventoryBranch;const cards=data.products.map(p=>{const s=stockValue(current,p.id);return `<div class="card"><div class="flex between center"><h3 style="margin:0">${sanitize(p.name)}</h3><span class="pill">${sanitize(p.unit)}</span></div><p class="muted xs">${sanitize(p.detail||'')}</p>${s===null?`<div class="stock-unset">Sin inventario inicial</div><p class="caption">Primero registra el conteo físico de partida.</p>`:`<div class="stock-number ${s.expected<0?'warn-num':''}">${integer(s.expected)} <span class="muted xs">estimadas</span></div><div class="divider"></div><div class="metric-line"><span>Inicial</span><strong>${integer(s.base)}</strong></div><div class="metric-line"><span>Entregas</span><strong class="text-green">+${integer(s.received)}</strong></div><div class="metric-line"><span>Ventas</span><strong>−${integer(s.sold)}</strong></div><div class="metric-line"><span>Mermas</span><strong>−${integer(s.waste)}</strong></div>${s.expected<0?`<div class="mini-note stock-warning">Inventario teórico negativo. Verifica entregas, ventas y conteos.</div>`:''}`}</div>`});const pending=data.products.filter(p=>stockValue(current,p.id)===null).length;const closes=sortByDate(data.closings.filter(c=>c.branch===current)).slice(0,8);return `${pageTitle('Inventario por sucursal','Existencia teórica = conteo inicial + entregas − ventas − mermas.',button('Registrar conteo inicial','stock-start','secondary','clipboard'))}
<div class="flex gap12 wrap center" style="margin-bottom:18px">${branchFilter(current,'stock-branch',false)} ${pending?`<span class="pill pill-warn">${pending} productos sin inventario inicial</span>`:`<span class="pill pill-success">Inventario de partida configurado</span>`}</div><div class="grid grid-2" style="margin-bottom:20px">${cards.join('')}</div><div class="card"><h3>Conteos físicos registrados en cortes</h3><p class="section-intro">El cierre captura las existencias físicas y permite compararlas con las cantidades teóricas al finalizar el día.</p>${table(['Fecha','Producto','Teórico al cierre','Físico registrado','Diferencia'],closes.flatMap(c=>Object.entries(c.stockCounts||{}).map(([id,qty])=>{const s=stockValue(c.branch,id,c.date);return `<tr><td>${sanitize(fmtDate(c.date))}</td><td>${sanitize(productName(id))}</td><td>${s?integer(s.expected):'Sin base'}</td><td>${integer(qty)}</td><td class="${s&&qty-s.expected!==0?'warn-num':'success-num'}">${s?integer(qty-s.expected):'—'}</td></tr>`})).join(''))}<p class="caption" style="padding:0 17px 15px">Si un conteo no cuadra, se investiga y documenta. No se ajustan inventarios automáticamente para ocultar diferencias.</p></div>`}
function renderCash(){const branch=ui.cashBranch,history=sortByDate(data.closings.filter(c=>c.branch===branch));const nonzero=history.filter(c=>Math.abs(c.cashCount-cashExpected(c.date,c.branch,c.float,c.withdrawals).total)>0.009);return `${pageTitle('Corte y conciliación de caja','El efectivo físico debe coincidir con lo esperado después de considerar entradas y salidas.',button('Registrar corte','closing-new','primary','plus'))}<div class="flex gap12 wrap center" style="margin-bottom:18px">${branchFilter(branch,'cash-branch',false)} <span class="pill">Cierre posterior a las 23:00 h</span></div>
<div class="grid grid-3" style="margin-bottom:19px">${kpi('Cortes registrados',integer(history.length),'En esta sucursal','clipboard')}${kpi('Cortes con diferencia',integer(nonzero.length),'Investigar diferencias','alert','red')}${kpi('Último cierre',history.length?fmtDate(history[0].date):'—','Fecha del registro más reciente','calendar','blue')}</div>
<div class="card table-card"><div class="table-top"><div><h3>Historial de cortes</h3><p>Fondo + efectivo cobrado − gastos pagados desde caja − retiros = efectivo esperado.</p></div></div>${table(['Fecha','Fondo','Efectivo cobrado','Salidas de caja','Esperado','Contado','Diferencia'],history.map(c=>{const val=cashExpected(c.date,c.branch,c.float,c.withdrawals);return `<tr><td>${sanitize(fmtDate(c.date))}</td><td>${money(c.float)}</td><td>${money(val.cash)}</td><td>${money(val.cashOut+c.withdrawals)}</td><td>${money(val.total)}</td><td>${money(c.cashCount)}</td><td class="${Math.abs(c.cashCount-val.total)>.009?'warn-num':'success-num'}"><strong>${money(c.cashCount-val.total)}</strong></td></tr>`}).join(''))}</div>
<div class="subtle-banner" style="margin-top:17px">${I('alert')} <div><strong>Validación pendiente:</strong> los cobros por terminal y transferencia deben contrastarse con comprobantes y movimientos bancarios. El total vendido no siempre equivale al depósito neto por las comisiones de la terminal.</div></div>`}
function renderFinances(){const purchases=sum(data.purchases,x=>x.total),expenses=sum(byBranch(data.expenses,ui.financeBranch),x=>x.amount),sold=salesTotals(ui.financeBranch).total;const e=byBranch(data.expenses,ui.financeBranch);return `${pageTitle('Gastos y finanzas','Separar las ventas de los egresos y conocer mejor el movimiento del dinero.',button('Registrar gasto','expense-new','primary','plus'))}
<div class="grid grid-3" style="margin-bottom:19px">${kpi('Ventas registradas',money(sold),'Ingresos de pedidos','coins')}${kpi('Gastos operativos',money(expenses),'Sin compras de insumos','wallet','red')}${kpi('Compras centralizadas',money(purchases),'Registro de insumos de producción','shopping-cart','blue')}</div>
<div class="subtle-banner">${I('circle-info')} <div><strong>Importante:</strong> ventas menos compras o gastos <strong>no equivalen a utilidad neta</strong>. Faltan costos de inventario consumido, sueldos, comisiones, mermas, servicios y otros gastos, además de las fechas de pago. Por ahora se muestra el registro de entradas y salidas, no un estado de resultados.</div></div>
<div class="card table-card"><div class="table-top"><div><h3>Gastos operativos</h3><p>Gas, aceite, empaques, transporte, servicios y otros conceptos.</p></div>${branchFilter(ui.financeBranch,'finance-branch')}</div>${table(['Fecha','Área','Categoría','Concepto','Método','Desde caja','Importe'],sortedRows(e,120).map(x=>`<tr><td>${sanitize(fmtDate(x.date))}</td><td>${sanitize(branchName(x.branch))}</td><td>${sanitize(x.category)}</td><td>${sanitize(x.concept)}</td><td>${sanitize(methodName(x.method))}</td><td>${x.fromCash?'Sí':'No'}</td><td class="mono">${money(x.amount)}</td></tr>`).join(''))}</div>
<div class="card" style="margin-top:17px"><h3>Próximo nivel: costo y rentabilidad por producto</h3><p class="section-intro">Cuando tengamos precios, cantidades estándar, rendimientos, costo de ingredientes, aceite, empaques y mano de obra, el sistema podrá comparar el costo por porción con su precio de venta y estimar márgenes. No se inventarán costos para completar este módulo.</p></div>`}
function renderTeam(){return `${pageTitle('Personal, seguridad y procesos','Preparar una operación que pueda ser ejecutada por un trabajador capacitado sin revelar recetas.')}
<div class="grid grid-2" style="margin-bottom:19px"><div class="card"><div class="section-heading"><h2>El puesto que se desea contratar</h2>${pill('Por definir')}</div><p class="section-intro">Un primer colaborador asumirá la <strong>instalación del puesto, recepción de producto, preparación final, atención, cobro y cierre</strong>. Los propietarios conservarán compras, preparación y condimentación central, supervisión y revisión de la caja.</p><div class="grid grid-2">${[['Operación','19:00–23:00'],['Puntos de venta','2'],['Contratación inicial','1 colaborador'],['Producción','Propietarios']].map(([a,b])=>`<div class="kpi-simple"><label>${a}</label><strong style="font-size:15px">${b}</strong></div>`).join('')}</div><p class="caption" style="margin-top:14px">El horario de preparación previa y cierre posterior aún debe definirse para calcular la jornada de trabajo real.</p></div><div class="card"><h2>Separación de conocimientos</h2><div class="policy-list"><div class="policy-item"><h4>${I('check',16)} El empleado necesita conocer</h4><p>Porcionado, cocción, armado, calidad del producto, atención al cliente, higiene, cobro y registro de incidencias.</p></div><div class="policy-item"><h4>${I('lock',16)} Reservado a los propietarios</h4><p>Proporciones de sazonado, formulaciones de mezclas, recetas maestras y cualquier procedimiento que no sea necesario para desempeñar el puesto.</p></div></div></div></div>
<div class="grid grid-2" style="margin-bottom:19px"><div class="card"><h2>Manual operativo: estructura propuesta</h2><div class="helper-steps">${[['1','Antes de abrir','Recepción de lote, conteo inicial, equipo, limpieza, temperaturas y fondo de caja.'],['2','Durante la operación','Tomar pedido, preparar producto, verificar calidad, cobrar y registrar ticket.'],['3','Al cierre','Contar inventario, registrar mermas y gastos, conciliar cobros y dejar limpio.'],['4','Incidencias','Producto dañado, falta de cambio, cobro erróneo, falla de terminal, desviación sanitaria.']].map(([a,b,c])=>`<div class="helper-step"><span class="step-number">${a}</span><div><strong>${b}</strong><p>${c}</p></div></div>`).join('')}</div></div><div class="card"><h2>Capacitación y evaluación</h2><div class="helper-steps">${[['1','Inducción','Funciones, atención, seguridad y confidencialidad.'],['2','Práctica supervisada','Montaje, preparación final y cobro con casos reales.'],['3','Prueba operativa','Cierre, inventario y conciliación sin ayuda.'],['4','Seguimiento','Revisión de incidencias y desempeño en jornadas posteriores.']].map(([a,b,c])=>`<div class="helper-step"><span class="step-number">${a}</span><div><strong>${b}</strong><p>${c}</p></div></div>`).join('')}</div></div></div>
<div class="card" style="margin-bottom:19px"><h2>Protección legal y de la información</h2><p class="section-intro">Se prepararán documentos y controles reales, no solo una cláusula para «impedir que compitan».</p><div class="policy-list"><div class="policy-item"><h4>Confidencialidad de secretos industriales</h4><p>Identificar por escrito la información reservada, limitar accesos, documentar el conocimiento del deber de confidencialidad y someter el convenio a revisión jurídica. Artículos 163–166 de la Ley Federal de Protección a la Propiedad Industrial. <a target="_blank" rel="noopener noreferrer" href="https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPPI.pdf">Consultar ley</a>.</p></div><div class="policy-item"><h4>No competencia de dos años</h4><p>No asumir que prohibir trabajar en el mismo giro durante dos años sea válido. El artículo 5 constitucional protege la libertad de trabajo. Enfocar la protección en secretos, no en vetar un empleo lícito. <a target="_blank" rel="noopener noreferrer" href="https://museodelasconstituciones.unam.mx/articulo-5/">Consultar artículo 5</a>.</p></div><div class="policy-item"><h4>Obligaciones laborales</h4><p>Antes de contratar: revisar contrato de trabajo, jornada real, prestaciones, inscripción patronal/IMSS, obligaciones fiscales y aviso de privacidad. La Ley Federal del Trabajo, artículo 134 fracción XIII, contempla el deber de guardar secretos. <a target="_blank" rel="noopener noreferrer" href="https://www.diputados.gob.mx/LeyesBiblio/pdf/LFT.pdf">Consultar LFT</a>.</p></div><div class="policy-item"><h4>Seguridad e higiene alimentaria</h4><p>El piloto no suspende el cumplimiento sanitario. Incorporar limpieza, control de temperaturas, transporte y manejo de alimentos conforme a la NOM-251-SSA1-2009. <a target="_blank" rel="noopener noreferrer" href="https://sidof.segob.gob.mx/notas/docFuente/5133449">Consultar norma</a>.</p></div></div><p class="caption" style="margin-top:15px">Guía de planeación, no asesoría legal individual. Verificar permisos aplicables al comercio en cada ubicación con la autoridad competente y con profesionales autorizados.</p></div>
<div class="card"><div class="section-heading"><h2>Documentos por integrar</h2><a class="link xs" href="#documentos">Abrir biblioteca completa</a></div><div class="grid grid-3">${[['Convenio de confidencialidad','Protección de recetas e información sensible.'],['Contrato de trabajo','Funciones, horarios y condiciones del puesto.'],['Aviso de privacidad','Tratamiento de datos personales del trabajador.']].map(([t,d])=>`<div class="kpi-simple"><strong style="font-size:14px;margin:0 0 8px">${t}</strong><span class="muted xs">${d}</span><div style="margin-top:12px">${pill('Pendiente')}</div></div>`).join('')}</div></div>`}
function renderSettings(){
  const canEdit=Boolean(authState.catalogSynced&&authState.client&&authState.user&&validMember(authState.member,authState.user));
  const newButton=canEdit?button('Añadir presentación','product-new','secondary','plus'):'<button class="btn btn-secondary" disabled>Edición no disponible sin conexión autorizada</button>';
  const products=data.products.map(p=>`<div class="settings-product"><div><h4>${sanitize(p.name)} ${p.active===false?'<span class="caption">(Inactivo)</span>':''}</h4><span>${sanitize(p.unit)} · ${sanitize(p.detail||'Sin descripción')}</span></div><div class="flex gap12 center"><strong class="text-yellow">${p.price==null?'Sin precio':money(p.price)}</strong>${canEdit?`<button class="mini-action" data-action="product-edit" data-id="${sanitize(p.id)}">Editar</button>`:'<button class="mini-action" disabled>Editar</button>'}</div></div>`).join('');
  return `${pageTitle('Menú y configuración','Catálogo consultado en Supabase e historial local en transición.')}<div class="grid grid-main"><div class="card"><div class="section-heading"><h2>Catálogo de productos</h2>${newButton}</div><p class="section-intro">Administración de presentaciones y precios en Supabase. Los costos privados se gestionarán por separado. Cada presentación se registra como un producto independiente.</p>${products||'<p class="caption">Sin productos registrados.</p>'}</div><div class="card"><h2>Datos, respaldos y seguridad</h2><div class="metric-line"><span>Sucursales y catálogo</span><strong>${authState.catalogSynced?'Lectura confirmada en Supabase':'Sin lectura confirmada'}</strong></div><p class="caption">Última lectura confirmada: ${authState.lastCatalogRead?sanitize(new Date(authState.lastCatalogRead).toLocaleString('es-MX')):'Ninguna en esta sesión'}. Sin sincronización automática en tiempo real.</p><p class="section-intro">Compras, entregas, inventario, ventas, gastos, caja y consultoría: historial local pendiente de migración. Producción: módulo independiente pendiente. Nuevas capturas suspendidas.</p><div class="helper-steps">${button('Exportar historial local JSON','export-json','primary','download')}${button('Exportar ventas locales CSV','export-csv','ghost','download')}${button('Revisar archivo JSON sin importar','import-json','secondary','upload')}</div><div class="divider"></div><p class="caption">El JSON conserva el contenido original del navegador, incluido el catálogo histórico. El CSV contiene ventas locales, fecha, sucursal y origen. Estas exportaciones manuales no son un respaldo integral de la base de datos. No se han verificado copias automáticas. La revisión de JSON no cambia datos locales ni de Supabase.</p><p class="caption">Los cambios en productos se realizan mediante la sesión administrativa y las políticas RLS del servidor.</p></div></div>`;
}

function renderEmployeeHome(){const branch=authState.member.branch_id,today=localISO(),activeToday=authState.remoteSales.filter(s=>!s.voidedAt&&s.branch===branch&&s.date===today),totals={total:sum(activeToday,s=>s.total),orders:activeToday.length};return `${pageTitle('Mi turno','Panel operativo para '+sanitize(branchName(branch))+'. Las restricciones de sucursal se validan también en PostgreSQL.')}
<div class="grid grid-3" style="margin-bottom:19px">${kpi('Ventas activas',money(totals.total),'Ventas de hoy en tu sucursal','coins')}${kpi('Pedidos',integer(totals.orders),'Tickets activos de hoy','shopping-bag','blue')}${kpi('Sucursal',sanitize(branchName(branch)),'Asignación de membresía','store','green')}</div>
<div class="card"><h3>Acciones de turno</h3><p class="section-intro">Puedes registrar ventas con precios oficiales, consultar tickets autorizados y revisar el catálogo. No puedes modificar precios, otros puestos ni tickets finalizados.</p><div class="hero-actions">${authState.salesProbe?.serverReady&&authState.salesLoaded?button('Nueva venta','sale-new','primary','plus'):'<button class="btn btn-secondary" disabled>Ventas en verificación</button>'}<a href="#ventas" class="btn btn-secondary">Ver pedidos</a></div></div>`}
function renderEmployeeInventory(){const products=data.products.filter(p=>p.active!==false);return `${pageTitle('Catálogo y existencias autorizadas','Precios oficiales de consulta para '+sanitize(branchName(authState.member.branch_id))+'.')}
<div class="subtle-banner">${I('shield')} <div><strong>Consulta restringida.</strong> El inventario físico no se modifica desde este panel. La fuente de existencias por sucursal deberá conectarse a una tabla RLS específica antes de mostrar cantidades.</div></div>
<div class="grid grid-3">${products.map(p=>`<article class="card"><span class="caption">${sanitize(p.unit)}</span><h3>${sanitize(p.name)}</h3><p class="section-intro">Precio oficial: <strong>${p.price===null?'Pendiente de establecer':money(p.price)}</strong></p></article>`).join('')}</div>`}
function renderEmployeeTeam(){return `${pageTitle('Políticas operativas','Reglas aprobadas para personal de sucursal.')}
<div class="policy-list"><div class="policy-item"><h4>Tickets</h4><p>Registra cada venta con los precios oficiales. Un ticket cobrado no se edita ni se anula desde este panel.</p></div><div class="policy-item"><h4>Incidencias y mermas</h4><p>Reporta la incidencia al responsable del turno; la captura persistente se habilitará cuando exista una ruta transaccional autorizada.</p></div><div class="policy-item"><h4>Acceso</h4><p>Tu sesión solo puede consultar datos autorizados de tu sucursal. Cierra sesión al terminar el turno.</p></div></div>`}
// Remote operational screens: never mix local pilot history with financial records.
const operationsData=()=>authState.operations||{};
const operationReady=key=>Array.isArray(operationsData()[key]);
const operationNotice=(key,description)=>`<div class="subtle-banner">${I('shield')} <div><strong>${operationReady(key)?'Datos consultados en Supabase.':'Módulo pendiente de despliegue.'}</strong> ${sanitize(operationReady(key)?description:(operationsData()[key]?.error||'La migración necesaria todavía no está activa. No se mostrarán cifras locales como oficiales.'))}</div></div>`;
async function refreshOperations(epoch=authState.epoch){
 const rows=await fetchOperations(authState.client);
 if(epoch!==authState.epoch||authState.status!=='authenticated')return false;
 authState.operations=rows;
 if(['inventario','caja','finanzas','abasto'].includes(location.hash.slice(1)))render();
 return true;
}
function renderRemoteInventory(){
 const op=operationsData(),branch=isEmployee()?authState.member.branch_id:ui.inventoryBranch,items=Array.isArray(op.items)?op.items:[],balances=Array.isArray(op.balances)?op.balances:[];
 const rows=items.map(item=>{const balance=balances.find(r=>r.item_id===item.id&&r.location_id===branch);return `<tr><td>${sanitize(item.name)}</td><td>${sanitize(item.base_unit)}</td><td class="mono">${balance?new Intl.NumberFormat('es-MX',{maximumFractionDigits:3}).format(Number(balance.quantity)):'0'}</td></tr>`}).join('');
 const actions=operationReady('balances')&&operationReady('items')&&isAdmin()?`${button('Saldo inicial','inventory-opening','secondary','plus')} ${button('Registrar merma','inventory-waste','primary','package')} ${button('Traspasar inventario','inventory-transfer','secondary','truck')}`:'';
 return `${pageTitle('Inventario y mermas','Existencias según movimientos contabilizados en Supabase.',actions)}
 ${operationNotice('balances','Las cantidades se calculan desde el libro de movimientos por ubicación. Una compra recibida se contabiliza una sola vez.')}
 <div style="margin:18px 0">${isEmployee()?`<span class="pill">${sanitize(branchName(branch))}</span>`:branchFilter(branch,'stock-branch',false)}</div>
 <div class="card table-card"><div class="table-top"><h3>Existencia por artículo</h3></div>${table(['Insumo o producto','Unidad','Existencia'],rows)}</div>
 <p class="caption" style="margin-top:15px">No se estiman consumos de recetas ni salidas por ventas hasta configurar fichas técnicas. No ajustar inventario manualmente sin evidencia.</p>`;
}
function renderRemoteCash(){
 const op=operationsData(),branch=ui.cashBranch,sessions=Array.isArray(op.sessions)?op.sessions.filter(s=>s.branch_id===branch):[],ready=operationReady('sessions');
 const current=sessions.find(s=>s.business_date===localISO());
 const active=current?.status==='open'?current:null;
 const buttons=ready?(active?button('Cerrar caja','cash-close','primary','check'):(current?.status==='closed'?'<span class="pill">Jornada cerrada</span>':button('Abrir caja','cash-open','primary','plus'))):'';
 return `${pageTitle('Corte de caja','Conciliación de cobros y egresos por jornada.',buttons)}
 ${operationNotice('sessions','Los cálculos de efectivo provienen de las ventas y gastos remotos; los cierres quedan registrados por sucursal.')}
 <div style="margin:18px 0">${branchFilter(branch,'cash-branch',false)}</div>
 <div class="card table-card"><div class="table-top"><h3>Historial de jornadas</h3></div>${table(['Fecha','Estado','Fondo','Esperado','Contado','Diferencia'],sessions.map(s=>`<tr><td>${sanitize(fmtDate(s.business_date))}</td><td>${sanitize(s.status==='closed'?'Cerrado':'Abierto')}</td><td>${money(s.opening_float)}</td><td>${s.expected_cash===null?'—':money(s.expected_cash)}</td><td>${s.counted_cash===null?'—':money(s.counted_cash)}</td><td>${s.difference===null?'—':money(s.difference)}</td></tr>`).join(''))}</div>`;
}
function renderRemoteFinances(){
 const op=operationsData(),rows=Array.isArray(op.expenses)?op.expenses.filter(r=>ui.financeBranch==='all'||r.branch_id===ui.financeBranch):[];
 const sales=authState.salesLoaded?authState.remoteSales.filter(s=>!s.voidedAt&&(ui.financeBranch==='all'||s.branch===ui.financeBranch)).reduce((n,s)=>n+s.total,0):null;
 const expenses=rows.reduce((n,r)=>n+Number(r.amount||0),0);
 const purchases=authState.purchasesLoaded?authState.remotePurchases.filter(p=>p.status==='received'&&(ui.financeBranch==='all'||p.locationId===ui.financeBranch)).reduce((n,p)=>n+p.total,0):null;
 return `${pageTitle('Gastos y finanzas','Información financiera registrada en Supabase.',operationReady('expenses')?button('Registrar gasto','finance-expense','primary','plus'):'')}
 ${operationNotice('expenses','Los gastos son independientes de las compras; compras recibidas no representan automáticamente costo vendido.')}
 <div class="grid grid-3" style="margin:18px 0">${kpi('Ventas vigentes',sales===null?'No disponible':money(sales),'Ventas no anuladas','coins')}${kpi('Gastos operativos',money(expenses),'Egresos registrados','wallet','red')}${kpi('Compras recibidas',purchases===null?'No disponible':money(purchases),'No equivalente a gasto contable','shopping-cart','blue')}</div>
 ${branchFilter(ui.financeBranch,'finance-branch')}
 <div class="card table-card"><div class="table-top"><h3>Gastos registrados</h3></div>${table(['Fecha','Sucursal','Categoría','Concepto','Pago','Importe'],rows.map(r=>`<tr><td>${sanitize(fmtDate(r.expense_date))}</td><td>${sanitize(branchName(r.branch_id))}</td><td>${sanitize(r.category)}</td><td>${sanitize(r.description)}</td><td>${sanitize(methodName(r.payment_method))}</td><td>${money(r.amount)}</td></tr>`).join(''))}</div>
 <p class="caption" style="margin-top:15px">Estas cifras no constituyen utilidad neta. Faltan costeo de recetas, nómina, comisiones y conciliación bancaria.</p>`;
}
function operationDialog(title,fields,process){
 requireAdmin();const dlg=document.getElementById('dialog'),target=document.getElementById('dialog-content');
 target.innerHTML=`<form id="operation-form"><div class="modal-header"><h2>${sanitize(title)}</h2><button type="button" class="icon-button" data-close aria-label="Cerrar">${I('x')}</button></div><div class="modal-body"><div class="form-grid">${fields}</div><p id="operation-error" class="caption" role="alert" hidden></p></div><div class="modal-footer"><button type="button" class="btn btn-ghost" data-close>Cancelar</button><button type="submit" class="btn btn-primary">Confirmar en Supabase</button></div></form>`;
 const form=target.querySelector('form'),submit=form.querySelector('[type="submit"]'),errorBox=target.querySelector('#operation-error'),requestId=operationId();
 target.querySelectorAll('[data-close]').forEach(btn=>btn.onclick=()=>{if(!submit.disabled)dlg.close()});
 form.onsubmit=async event=>{event.preventDefault();if(submit.disabled)return;submit.disabled=true;errorBox.hidden=true;
 try{requireAdmin();await process(new FormData(form),requestId);try{await refreshOperations();if(authState.purchasesProbe?.serverReady)authState.purchaseCatalog=await loadPurchaseCatalog(authState.client);}catch(refreshError){console.warn('La operación se guardó, pero no se pudo refrescar la información:',refreshError.message)}dlg.close();render();toast('Operación confirmada por Supabase.');}
 catch(e){errorBox.hidden=false;errorBox.textContent=e.message||'No se confirmó el movimiento.';toast(errorBox.textContent,'error')}
 finally{submit.disabled=false}};
 dlg.showModal();
}
function openInventoryMovement(kind){
 const op=operationsData(),items=Array.isArray(op.items)?op.items:[],locs=Array.isArray(op.locations)?op.locations:[];
 if(!items.length||!locs.length){toast('Primero registra artículos y ubicaciones en Supabase.','error');return}
 const type=kind==='opening'?'opening':'waste';
 operationDialog(type==='opening'?'Registrar saldo inicial':'Registrar merma',`${selectInput('location','Ubicación',locs.map(x=>[x.id,x.name]),ui.inventoryBranch)}${selectInput('item','Artículo',items.map(x=>[x.id,`${x.name} (${x.base_unit})`]),items[0].id)}${numberInput('qty','Cantidad',{min:0.001,step:'0.001'})}${textInput('note','Motivo / documento',{required:type==='waste'})}`,
 (fd,requestId)=>postInventory(authState.client,{location_id:String(fd.get('location')),item_id:String(fd.get('item')),quantity:(type==='waste'?-1:1)*Number(fd.get('qty')),movement_type:type,notes:String(fd.get('note')||'')},requestId));
}
function openStockTransfer(){
 const op=operationsData(),items=Array.isArray(op.items)?op.items:[],locs=Array.isArray(op.locations)?op.locations:[];
 if(!items.length||locs.length<2){toast('Primero configura insumos y ubicaciones.','error');return}
 operationDialog('Registrar entrega confirmada',`${selectInput('from','Origen',locs.map(x=>[x.id,x.name]),'central')}${selectInput('to','Destino',locs.map(x=>[x.id,x.name]),ui.inventoryBranch)}${selectInput('item','Insumo',items.map(x=>[x.id,x.name]),items[0].id)}${numberInput('quantity','Cantidad entregada',{min:0.001,step:'0.001'})}<p class="caption form-span">Solo registrar cuando la recepción física haya sido confirmada. El traspaso mueve existencias inmediatamente.</p>`,(fd,requestId)=>transferStock(authState.client,{from_location_id:String(fd.get('from')),to_location_id:String(fd.get('to')),item_id:String(fd.get('item')),quantity:Number(fd.get('quantity'))},requestId));
}
function openCashOperation(kind){
 const branch=ui.cashBranch,session=Array.isArray(operationsData().sessions)?operationsData().sessions.find(s=>s.branch_id===branch&&s.business_date===localISO()&&s.status==='open'):null;
 if(kind==='open')operationDialog('Abrir caja',`${dateInput()}${numberInput('float','Fondo de apertura',{min:0,step:'0.01',value:0})}<p class="caption form-span">Sucursal: ${sanitize(branchName(branch))}</p>`,(fd,requestId)=>openCashSession(authState.client,{branch,date:String(fd.get('date')),float:Number(fd.get('float'))},requestId));
 else if(session)operationDialog('Cerrar caja',`${numberInput('counted','Efectivo físico contado',{min:0,step:'0.01'})}${numberInput('withdrawals','Retiros del turno',{min:0,step:'0.01',value:0})}${textInput('note','Observaciones',{required:false})}`,(fd,requestId)=>closeCashSession(authState.client,{id:session.id,counted:Number(fd.get('counted')),withdrawals:Number(fd.get('withdrawals')),note:String(fd.get('note')||'')},requestId));
 else toast('No existe una caja abierta para hoy en esta sucursal.','error');
}
function openRemoteExpense(){
 operationDialog('Registrar gasto',`${dateInput()}${selectInput('branch','Sucursal / área',[['central','Producción central'],...BRANCHES.map(b=>[b.id,b.name])],'mora')}${selectInput('category','Categoría',[['Gas','Gas'],['Aceite','Aceite'],['Transporte','Transporte'],['Servicios','Servicios'],['Otros','Otros']],'Gas')}${textInput('concept','Concepto')}${numberInput('amount','Importe',{min:0.01,step:'0.01'})}${selectInput('method','Método de pago',METHODS,'efectivo')}<label class="field-check form-span"><input type="checkbox" name="drawer"> Efectivo retirado de caja</label>`,(fd,requestId)=>{
 const branch=String(fd.get('branch'));const drawer=fd.has('drawer');const method=String(fd.get('method'));
 if(drawer&&(branch==='central'||method!=='efectivo'))throw Error('Para gasto de caja elige una sucursal y efectivo.');
 return recordExpense(authState.client,{date:String(fd.get('date')),branch:branch==='central'?null:branch,description:String(fd.get('concept')),category:String(fd.get('category')),method,paidFromDrawer:drawer,amount:Number(fd.get('amount'))},requestId);
 });
}
function openCatalogRecord(kind){
 const table=kind==='supplier'?'pw_suppliers':'pw_inventory_items';
 if(kind==='supplier')operationDialog('Nuevo proveedor',`${textInput('name','Nombre comercial')}${textInput('tax','RFC',{required:false})}${textInput('phone','Teléfono',{required:false})}`,fd=>catalogInsert(authState.client,table,{name:String(fd.get('name')).trim(),tax_id:String(fd.get('tax')||'').trim()||null,contact_phone:String(fd.get('phone')||'').trim()||null}));
 else operationDialog('Nuevo insumo',`${textInput('name','Nombre del artículo')}${selectInput('type','Tipo',[['raw_material','Materia prima'],['packaging','Empaque'],['consumable','Consumible'],['semi_finished','Semiterminado'],['finished_good','Producto terminado']],'raw_material')}${textInput('unit','Unidad base',{placeholder:'kg, litro, pieza, porción'})}${textInput('sku','Código SKU',{required:false})}`,fd=>catalogInsert(authState.client,table,{name:String(fd.get('name')).trim(),item_type:String(fd.get('type')),base_unit:String(fd.get('unit')).trim(),sku:String(fd.get('sku')||'').trim()||null}));
}

function render(){
  if(authState.status!=='authenticated'||!authState.user||!validMember(authState.member,authState.user)){showAuthGate();return}
  let page=location.hash.slice(1)||'inicio';const employeePages=new Set(['inicio','ventas','pedido','inventario','equipo']);
  if(!(page in PAGE_NAMES)||isEmployee()&&!employeePages.has(page)){page='inicio';history.replaceState(null,'','#inicio')}
  ui.page=page;document.title=`${PAGE_NAMES[page]} | Plebes Wings`;document.getElementById('breadcrumb-page').textContent=isEmployee()&&page==='inicio'?'Mi turno':PAGE_NAMES[page];
  document.querySelectorAll('[data-page]').forEach(el=>{el.classList.toggle('active',el.dataset.page===page);if(el.dataset.page===page)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current')});
  const renders=isEmployee()?{inicio:renderEmployeeHome,ventas:renderSales,pedido:renderPOS,inventario:renderRemoteInventory,equipo:renderEmployeeTeam}:{inicio:renderHome,ruta:renderRoadmap,documentos:renderDocuments,ventas:renderSales,pedido:renderPOS,abasto:renderAbasto,inventario:renderRemoteInventory,caja:renderRemoteCash,finanzas:renderRemoteFinances,equipo:renderTeam,ajustes:renderSettings};
  document.getElementById('main-content').innerHTML=renders[page]();document.getElementById('year').textContent=new Date().getFullYear();if(page==='pedido')bindPOS();closeNav();
}
function closeNav(){setNav(false)}
function printStamp(value){const date=value?new Date(value):new Date();return new Intl.DateTimeFormat('es-MX',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Mexico_City'}).format(date)}
function printDocument(kind,{branch,lines,note='',reference='',ticket='',payments=[],paymentDescription='',total=0,paper='80',createdAt='',voidedAt=null}={}){
  const frame=document.getElementById('print-frame');
  if(!frame?.contentWindow)throw Error('No se encontró el documento de impresión.');
  const title=kind==='kitchen'?'COMANDA DE COCINA':'COMPROBANTE DE COMPRA';
  const showAmounts=kind==='ticket'||kind==='kitchen';
  const rows=(lines||[]).map(line=>{const unitPrice=Number(line.unitPrice??line.unit_price),lineTotal=Number(line.lineTotal??line.line_total??(Number(line.quantity)*unitPrice));return `<div class="print-line"><strong>${integer(line.quantity)} × ${sanitize(line.name||productName(line.productId))}</strong>${showAmounts?`<span>${money(lineTotal)}</span>`:''}</div>${showAmounts?`<div class="print-subline">${money(unitPrice)} c/u</div>`:''}`}).join('')||'<p>Sin productos.</p>';
  const paymentLabel=payments.length?payments.map(payment=>`${sanitize(methodName(payment.method))}: ${money(payment.amount)}`).join(' · '):String(paymentDescription||'').trim();
  const width=paper==='58'?'58':'80',base=sanitize(new URL('./',location.href).href);
  const documentBody=`<article class="thermal-ticket"><header><img src="assets/plebes-logo.png" alt="Plebes Wings"><h1>Plebes Wings</h1><p>${sanitize(title)}</p></header><div class="print-meta"><span>${sanitize(branchName(branch))}</span><span>${sanitize(printStamp(createdAt))}</span>${reference?`<span>${sanitize(reference)}</span>`:''}</div>${voidedAt?'<p class="print-void">TICKET ANULADO</p>':''}<div class="print-divider"></div><section>${rows}</section>${note?`<div class="print-divider"></div><p class="print-note"><strong>Indicaciones:</strong> ${sanitize(note)}</p>`:''}${kind==='ticket'?`<div class="print-divider"></div><div class="print-total"><span>TOTAL</span><strong>${money(total)}</strong></div><p class="print-payment">${sanitize(paymentLabel)}</p><p class="print-ticket">Folio: ${sanitize(ticket)}</p><p class="print-legal">Comprobante de compra. No es un CFDI.</p>`:`<div class="print-divider"></div><div class="print-total"><span>TOTAL ESTIMADO</span><strong>${money(total)}</strong></div><p class="print-payment">${sanitize(paymentLabel)}</p><p class="print-draft">BORRADOR / NO REGISTRA VENTA NI COBRO</p>`}</article>`;
  frame.onload=()=>{frame.contentWindow.focus();frame.contentWindow.print()};
  frame.srcdoc=`<!doctype html><html lang="es"><head><base href="${base}"><meta charset="utf-8"><title>${sanitize(title)}</title><style>@page{size:${width}mm auto;margin:0}*{box-sizing:border-box}body{margin:0;background:#fff;color:#000;font-family:Arial,sans-serif;font-size:${width==='58'?'8.5':'10'}pt;line-height:1.3}.thermal-ticket{width:${width}mm;padding:${width==='58'?'2.5':'3'}mm}.thermal-ticket header{text-align:center}.thermal-ticket header img{display:block;width:${width==='58'?'29':'34'}mm;height:${width==='58'?'15':'18'}mm;object-fit:contain;margin:0 auto 2mm}.thermal-ticket h1{margin:0;font-size:${width==='58'?'13':'15'}pt}.thermal-ticket header p{margin:1mm 0;font-size:9pt;font-weight:700}.print-meta{display:grid;gap:1mm;margin-top:2mm}.print-divider{border-top:1px dashed #000;margin:3mm 0}.print-line{display:flex;justify-content:space-between;gap:3mm;margin-top:1.5mm}.print-subline{margin-left:3mm;font-size:8.5pt}.print-note{margin:0}.print-total{display:flex;justify-content:space-between;gap:4mm;font-size:13pt}.print-payment,.print-ticket,.print-legal,.print-draft{margin:3mm 0 0;text-align:center}.print-draft{border:1px solid #000;padding:2mm;font-weight:800}.print-void{margin:3mm 0;text-align:center;border:2px solid #000;padding:2mm;font-size:12pt;font-weight:800}</style></head><body>${documentBody}</body></html>`;
}
function printKitchenDraft({branch,lines,note,paper,payment,total,reference=''}){const paymentText=payment==='mixto'?'Forma de pago prevista: pago mixto (por confirmar)':`Forma de pago prevista: ${methodName(payment)}`;printDocument('kitchen',{branch,lines,note,reference:reference||`Borrador ${String(Date.now()).slice(-6)}`,paymentDescription:paymentText,total,paper});}
function printConfirmedTicket(sale,paper='80'){
  const lines=(sale.items||[]).map(item=>({name:productName(item.productId),quantity:item.qty,unitPrice:item.unitPrice,lineTotal:item.qty*item.unitPrice}));
  printDocument('ticket',{branch:sale.branch,lines,note:sale.note,ticket:sale.ticket,payments:sale.payments,total:sale.total,paper,createdAt:sale.createdAt||`${sale.date}T12:00:00`,voidedAt:sale.voidedAt});
}
function resetPOS(catalog=[]){posState.quantities=Object.fromEntries(catalog.map(product=>[product.id,0]));posState.requestId=crypto.randomUUID()}
function openSale(){requireAuthorized();const catalog=visualCatalog(data.products.filter(p=>p.active!==false));if(!catalog.some(product=>product.purchasable)){toast('No hay productos con precio oficial disponible.','error');return}resetPOS(catalog);location.hash='#pedido'}
function renderPOS(){
  const live=!!(SALES_WRITE_ENABLED&&authState.salesProbe?.serverReady&&authState.salesLoaded),catalog=visualCatalog(data.products.filter(p=>p.active!==false));
  if(!live)return `${pageTitle('Tomar pedido','El POS se habilita solo cuando la conexión y los permisos de ventas han sido comprobados.','<a class="btn btn-ghost" href="#ventas">Volver a ventas</a>')}<div class="subtle-banner">${I('shield')} <div><strong>Captura bloqueada.</strong> ${sanitize(authState.salesProbe?.error||'Comprueba la RPC y los permisos de ventas antes de abrir una caja.')}</div></div>`;
  if(!posState.requestId)resetPOS(catalog);
  const cards=catalog.map(product=>`<article class="pos-product-card ${product.purchasable?'':'is-unavailable'}"><div class="pos-product-image">${product.image?`<img src="${sanitize(product.image)}" alt="${sanitize(product.name)}" loading="eager">`:I('package',42)}</div><div class="pos-product-copy"><span class="caption">${sanitize(product.unit)}</span><h3>${sanitize(product.name)}</h3>${product.purchasable?`<strong>${money(product.price)}</strong>`:'<span class="pos-unavailable">No disponible</span>'}</div><button type="button" class="btn btn-secondary pos-add" data-pos-add="${sanitize(product.id)}" ${product.purchasable?'':'disabled'}>${I('plus',17)} Agregar</button></article>`).join('');
  return `<section class="pos-page"><div class="pos-page-head"><div><span class="eyebrow">PUNTO DE VENTA</span><h1>Tomar pedido</h1><p>Selecciona los productos; el cobro se registra solo tras confirmación del servidor.</p></div><a class="btn btn-ghost" href="#ventas">${I('x')} Cancelar</a></div><form id="sale-preview-form" class="pos-workspace"><section class="pos-menu"><div class="pos-section-head"><div><h2>Menú disponible</h2><p>Precios oficiales del catálogo autorizado.</p></div><span class="inline-chip">${sanitize(branchName(isEmployee()?authState.member.branch_id:BRANCHES[0]?.id))}</span></div><div class="pos-catalog" aria-label="Productos disponibles">${cards}</div></section><aside class="pos-cart" aria-label="Resumen del pedido"><div class="pos-cart-head"><div><span class="caption">PEDIDO ACTUAL</span><h2>Resumen</h2></div><span class="inline-chip" id="cart-units">0 artículos</span></div><div id="pos-cart-lines" class="pos-cart-lines" aria-live="polite"></div><div class="pos-cart-total"><span>Total</span><strong id="pos-cart-total">${money(0)}</strong></div><div class="pos-checkout-fields">${branchInput()}${selectInput('payment','Forma de pago',[...METHODS,['mixto','Mixto']],'efectivo')}<div class="form-field"><label for="f-paper">Formato de impresión</label><select id="f-paper" name="paper"><option value="80">Térmica 80 mm</option><option value="58">Térmica 58 mm</option></select></div><div class="form-span form-grid" id="preview-mixed" hidden>${numberInput('cash','Efectivo',{required:false,value:0})}${numberInput('card','Tarjeta',{required:false,value:0})}${numberInput('transfer','Transferencia',{required:false,value:0})}</div>${textInput('reference','Referencia de pago',{required:false,placeholder:'Solo tarjeta o transferencia'})}<div class="form-field form-span"><label for="f-note">Observaciones</label><textarea id="f-note" name="note" maxlength="400" placeholder="Ej. salsa aparte, sin cebolla"></textarea></div></div><div class="pos-actions"><button type="button" class="btn btn-ghost" id="print-kitchen" disabled>${I('clipboard')} Imprimir comanda</button><button type="button" class="btn btn-danger" id="clear-order" disabled>${I('x')} Vaciar pedido</button><button type="submit" class="btn btn-primary pos-charge" id="charge-sale" disabled>${I('coins')} Registrar venta</button></div><p class="pos-draft-note">La comanda es un borrador local: no crea venta, no reserva inventario ni incrementa ingresos.</p><div id="sale-preview-result" class="mini-note" hidden role="status" aria-live="polite"></div></aside></form></section>`;
}
function bindPOS(){
  const form=document.getElementById('sale-preview-form');if(!form)return;
  const catalog=visualCatalog(data.products.filter(p=>p.active!==false)),available=catalog.filter(product=>product.purchasable),mixed=form.querySelector('#preview-mixed'),result=form.querySelector('#sale-preview-result');
  const cartLines=form.querySelector('#pos-cart-lines'),cartTotal=form.querySelector('#pos-cart-total'),cartUnits=form.querySelector('#cart-units'),charge=form.querySelector('#charge-sale'),printKitchen=form.querySelector('#print-kitchen'),clear=form.querySelector('#clear-order'),epoch=authState.epoch;
  const updateCart=()=>{const summary=cartSummary(catalog,posState.quantities);cartUnits.textContent=`${integer(summary.units)} artículo${summary.units===1?'':'s'}`;cartTotal.textContent=money(summary.total);cartLines.innerHTML=summary.lines.length?summary.lines.map(line=>`<div class="pos-cart-line"><div><strong>${sanitize(line.name)}</strong><span>${money(line.unit_price)} c/u</span></div><div class="pos-qty"><button type="button" aria-label="Quitar ${sanitize(line.name)}" data-pos-delta="-1" data-product="${sanitize(line.product_id)}">−</button><strong>${integer(line.quantity)}</strong><button type="button" aria-label="Agregar ${sanitize(line.name)}" data-pos-delta="1" data-product="${sanitize(line.product_id)}">+</button><button type="button" class="pos-remove" aria-label="Eliminar ${sanitize(line.name)}" data-pos-remove="${sanitize(line.product_id)}">×</button></div></div>`).join(''):'<p class="pos-cart-empty">Selecciona productos para armar el pedido.</p>';const disabled=!summary.lines.length||form.dataset.saving==='true'||form.dataset.completed==='true';charge.disabled=disabled;printKitchen.disabled=!summary.lines.length;clear.disabled=!summary.lines.length;};
  form.addEventListener('click',event=>{const add=event.target.closest('[data-pos-add]'),change=event.target.closest('[data-pos-delta],[data-pos-remove]');if(add){posState.quantities=adjustCartQuantity(posState.quantities,add.dataset.posAdd,1);updateCart();return}if(!change)return;const id=change.dataset.product||change.dataset.posRemove;posState.quantities=change.dataset.posRemove?{...posState.quantities,[id]:0}:adjustCartQuantity(posState.quantities,id,Number(change.dataset.posDelta));updateCart()});
  form.elements.payment.addEventListener('change',()=>{mixed.hidden=form.elements.payment.value!=='mixto'});
  clear.addEventListener('click',()=>{if(!window.confirm('¿Vaciar el pedido actual?'))return;resetPOS(catalog);result.hidden=true;updateCart()});
  printKitchen.addEventListener('click',()=>{try{const summary=cartSummary(catalog,posState.quantities);if(!summary.lines.length)throw Error('Agrega al menos un producto para imprimir una comanda.');printKitchenDraft({branch:form.elements.branch.value,lines:summary.lines,note:form.elements.note.value.trim(),paper:form.elements.paper.value,payment:form.elements.payment.value,total:summary.total,reference:form.elements.reference.value.trim()})}catch(error){toast(error.message||'No se pudo preparar la comanda.','error')}});
  form.addEventListener('submit',async event=>{event.preventDefault();if(form.dataset.saving==='true'||form.dataset.completed==='true')return;result.hidden=false;let draft;try{requireAuthorized();if(epoch!==authState.epoch)throw Error('La sesión ha cambiado.');const fd=new FormData(form);draft=buildSaleDraft({date:localISO(),branch:fd.get('branch'),quantities:posState.quantities,payment:fd.get('payment'),splitPayments:{efectivo:fd.get('cash'),tarjeta:fd.get('card'),transferencia:fd.get('transfer')},reference:fd.get('reference'),note:fd.get('note'),requestId:posState.requestId},available,BRANCHES);const summary=cartSummary(catalog,posState.quantities);if(!window.confirm(`Confirmar cobro de ${money(summary.total)} por ${fd.get('payment')==='mixto'?'pago mixto':methodName(String(fd.get('payment')))} en ${branchName(String(fd.get('branch')))}?`)){result.textContent='Venta pendiente de confirmación. El pedido sigue intacto.';return}}catch(error){result.textContent=error.message||'Revisa el pedido.';return}form.dataset.saving='true';charge.disabled=true;charge.textContent='Registrando venta…';try{const confirmation=await registerSale(authState.client,draft,{approved:true});if(epoch!==authState.epoch)return;requireAuthorized();form.dataset.completed='true';result.textContent=`Venta confirmada. Folio: ${confirmation.ticket} · Total: ${money(confirmation.total)}. ${confirmation.replayed?'Se recuperó el mismo ticket, no se duplicó.':''}`;charge.textContent='Venta registrada';try{await refreshRemoteSales(epoch);const sale=authState.remoteSales.find(row=>row.id===confirmation.id);if(sale){const reprint=document.createElement('button');reprint.type='button';reprint.className='mini-action';reprint.textContent='Imprimir ticket confirmado';reprint.addEventListener('click',()=>printConfirmedTicket(sale,form.elements.paper.value));result.append(document.createElement('br'),reprint)}}catch{result.textContent+=' No se pudo actualizar el historial; consulta Ventas antes de reintentar.'}toast('Venta registrada en Supabase: '+confirmation.ticket)}catch(error){if(epoch===authState.epoch){result.textContent=(error.message||'No se pudo confirmar el ticket.')+' No cambies los datos de este intento sin antes consultar el historial.';charge.disabled=false;charge.textContent='Reintentar la misma venta'}}finally{form.dataset.saving='false';updateCart()}});
  updateCart();
}
function openDelivery(){modal('Registrar entrega','Documenta lo que llega efectivamente a cada puesto.',`<div class="form-grid">${dateInput()}${branchInput()}${selectInput('productId','Producto',data.products.map(p=>[p.id,p.name]),data.products[0]?.id)}${numberInput('quantity','Porciones recibidas',{min:0.001,step:'0.001',placeholder:'Cantidad real'})}${textInput('lot','Lote / remisión',{required:false,placeholder:'Ej.: REM-001'})}${textInput('deliveredBy','Entregó',{required:false,placeholder:'Nombre o iniciales'})}${textInput('receivedBy','Recibió',{required:false,placeholder:'Nombre o iniciales'})}${numberInput('temperature','Temperatura al recibir (°C)',{required:false,min:-30,step:'0.1',placeholder:'Si aplica'})}<div class="form-span">${textInput('note','Observaciones',{required:false,placeholder:'Incidencia, sellos, diferencia o condición de entrega'})}</div></div>`,fd=>{const {date,branch}=dateAndBranch(fd);const productId=String(fd.get('productId'));need(!!findProduct(productId),'Producto no encontrado.');const quantity=Number(fd.get('quantity'));need(quantity>0&&Number.isFinite(quantity),'Registra una cantidad válida.');const temp=String(fd.get('temperature')||'').trim();data.deliveries.push({id:uid(),date,branch,productId,quantity,lot:String(fd.get('lot')||'').trim(),deliveredBy:String(fd.get('deliveredBy')||'').trim(),receivedBy:String(fd.get('receivedBy')||'').trim(),temperature:temp===''?null:Number(temp),note:String(fd.get('note')||'').trim(),created:new Date().toISOString()})},'Guardar entrega');}
function purchaseLineForm(index){const items=authState.purchaseCatalog.items||[];return `<div class="form-grid" data-purchase-line style="margin:10px 0;padding:12px;border:1px solid var(--line);border-radius:10px">${selectInput(`purchase-item-${index}`,'Insumo',items.map(item=>[item.id,`${item.name} (${item.base_unit})`]),items[0]?.id||'')}${numberInput(`purchase-quantity-${index}`,'Cantidad',{min:0.001,step:'0.001'})}${numberInput(`purchase-cost-${index}`,'Costo unitario (MXN)',{min:0,step:'0.01'})}<div class="form-field"><span class="label">Unidad</span><div class="mini-note" data-purchase-unit>${sanitize(items[0]?.base_unit||'')}</div></div></div>`}
async function refreshRemotePurchases(epoch=authState.epoch){const rows=await loadPurchaseDocuments(authState.client);if(epoch!==authState.epoch||authState.status!=='authenticated')return false;authState.remotePurchases=rows;authState.purchasesLoaded=true;return true}
function openPurchase(){
  requireAdmin();if(!authState.purchasesProbe?.serverReady||!authState.purchaseCatalog.suppliers.length||!authState.purchaseCatalog.items.length||!authState.purchaseCatalog.locations.length){toast('Compras requiere proveedores, insumos y ubicaciones activos en Supabase.','error');return;}
  const dlg=document.getElementById('dialog'),target=document.getElementById('dialog-content'),catalog=authState.purchaseCatalog,epoch=authState.epoch;
  const suppliers=catalog.suppliers.map(row=>[row.id,row.name]),locations=catalog.locations.map(row=>[row.id,row.name]),methods=[['efectivo','Efectivo'],['tarjeta','Tarjeta'],['transferencia','Transferencia'],['credito','Crédito'],['otro','Otro']];
  target.innerHTML=`<form id="purchase-form"><div class="modal-header"><div><h2>Registrar compra</h2><p>Se guarda primero como borrador. Confirmar y recibir son acciones separadas y auditadas.</p></div><button type="button" class="icon-button" data-modal-close>${I('x')}</button></div><div class="modal-body"><div class="form-grid">${dateInput()}${selectInput('purchase-supplier','Proveedor',suppliers,suppliers[0][0])}${selectInput('purchase-location','Ubicación destino',locations,locations[0][0])}${selectInput('purchase-method','Método de pago',methods,'efectivo')}${textInput('purchase-supplier-reference','Folio del proveedor',{required:false,max:120})}${textInput('purchase-receipt','Comprobante',{required:false,max:180})}</div><h3 style="margin-top:18px">Partidas</h3><div id="purchase-lines">${purchaseLineForm(1)}</div><button type="button" class="btn btn-secondary" id="purchase-add-line">${I('plus')} Agregar partida</button><div class="form-field" style="margin-top:14px"><label for="purchase-notes">Observaciones</label><textarea id="purchase-notes" maxlength="800"></textarea></div><p class="caption" id="purchase-result" hidden role="status"></p></div><div class="modal-footer"><button type="button" class="btn btn-ghost" data-modal-close>Cancelar</button><button type="submit" class="btn btn-primary">${I('check')} Guardar borrador</button></div></form>`;
  const form=target.querySelector('#purchase-form'),lines=target.querySelector('#purchase-lines'),result=target.querySelector('#purchase-result'),submit=form.querySelector('[type="submit"]');
  const syncUnits=scope=>scope.querySelectorAll('[data-purchase-line]').forEach(line=>{const select=line.querySelector('select'),unit=line.querySelector('[data-purchase-unit]'),item=catalog.items.find(row=>row.id===select.value);unit.textContent=item?.base_unit||'';});
  syncUnits(form);form.addEventListener('change',event=>{if(event.target.name?.startsWith('purchase-item-'))syncUnits(form)});
  target.querySelector('#purchase-add-line').addEventListener('click',()=>{const next=lines.querySelectorAll('[data-purchase-line]').length+1;if(next>100){toast('Una compra admite hasta 100 partidas.','error');return;}lines.insertAdjacentHTML('beforeend',purchaseLineForm(next));syncUnits(lines);});
  target.querySelectorAll('[data-modal-close]').forEach(node=>node.addEventListener('click',()=>{if(form.dataset.saving!=='true')dlg.close()}));
  form.addEventListener('submit',async event=>{event.preventDefault();if(form.dataset.saving==='true')return;result.hidden=false;let draft;try{requireAuthorized();const linesPayload=[...lines.querySelectorAll('[data-purchase-line]')].map((line,index)=>{const itemId=line.querySelector(`select[name="purchase-item-${index+1}"]`)?.value,item=catalog.items.find(row=>row.id===itemId);return {item_id:itemId,unit:item?.base_unit,quantity:line.querySelector(`input[name="purchase-quantity-${index+1}"]`)?.value,unit_cost:line.querySelector(`input[name="purchase-cost-${index+1}"]`)?.value};});draft=buildPurchaseDraft({request_id:createPurchaseRequestId(),supplier_id:form.elements['purchase-supplier'].value,purchase_date:form.elements.date.value,payment_method:form.elements['purchase-method'].value,destination_location_id:form.elements['purchase-location'].value,supplier_reference:form.elements['purchase-supplier-reference'].value,receipt_reference:form.elements['purchase-receipt'].value,notes:target.querySelector('#purchase-notes').value,lines:linesPayload},catalog);}catch(error){result.textContent=error.message||'Revisa la compra.';return;}if(!window.confirm('¿Guardar esta compra como borrador? Aún no se recibirá ni afectará existencias.'))return;form.dataset.saving='true';submit.disabled=true;submit.textContent='Guardando…';try{const confirmation=await createPurchaseDraft(authState.client,draft);if(epoch!==authState.epoch)return;await refreshRemotePurchases(epoch);result.textContent=`Borrador ${confirmation.document_code} guardado${confirmation.replayed?' (recuperado sin duplicar)':''}.`;submit.textContent='Borrador guardado';render();}catch(error){result.textContent=error.message||'No se pudo guardar el borrador.';submit.disabled=false;submit.textContent='Reintentar el mismo borrador';}finally{form.dataset.saving='false'}});
  dlg.showModal();
}
async function transitionPurchase(id,action){
  requireAdmin();const document=authState.remotePurchases.find(row=>row.id===id);if(!document)return;
  const labels={confirm:'confirmar',receive:'registrar como recibida',void:'anular'};let reason='';if(action==='void'){reason=window.prompt('Motivo obligatorio de la anulación:')||'';if(!reason.trim())return;}if(!window.confirm(`¿Deseas ${labels[action]} la compra ${document.code}?`))return;
  try{const requestId=createPurchaseRequestId();if(action==='confirm')await confirmPurchase(authState.client,id,requestId);else if(action==='receive')await receivePurchase(authState.client,id,requestId);else await voidPurchase(authState.client,id,reason,requestId);await refreshRemotePurchases();render();toast(`Compra ${({confirm:'confirmada',receive:'recibida',void:'anulada'})[action]} en Supabase.`);}catch(error){toast(error.message||'No se pudo actualizar la compra.','error');}
}
function openWaste(){modal('Registrar merma','Toda pérdida debe tener cantidad, motivo y sucursal.',`<div class="form-grid">${dateInput()}${branchInput()}${selectInput('productId','Producto',data.products.map(p=>[p.id,p.name]),data.products[0]?.id)}${numberInput('quantity','Cantidad perdida',{min:0.001,step:'0.001'})}${selectInput('reason','Motivo',[['Producto quemado','Producto quemado'],['Caducidad','Caducidad'],['Error de preparación','Error de preparación'],['Producto caído','Producto caído'],['Devolución','Devolución'],['Otra','Otra']],'Error de preparación')}${textInput('note','Observaciones',{required:false})}</div>`,fd=>{const {date,branch}=dateAndBranch(fd);const quantity=Number(fd.get('quantity'));need(quantity>0,'La cantidad debe ser mayor que cero.');data.waste.push({id:uid(),date,branch,productId:String(fd.get('productId')),quantity,reason:String(fd.get('reason')),note:String(fd.get('note')||'').trim(),created:new Date().toISOString()})},'Guardar merma');}
function openExpense(){modal('Registrar gasto operativo','Los gastos de sucursal y producción central se registran por separado.',`<div class="form-grid">${dateInput()}${selectInput('branch','Área',[...BRANCHES.map(b=>[b.id,b.name]),['central','Producción central']],'mora')}${selectInput('category','Categoría',[['Gas','Gas'],['Aceite','Aceite'],['Empaques','Empaques'],['Transporte','Transporte'],['Servicios','Servicios'],['Mantenimiento','Mantenimiento'],['Insumos','Insumos'],['Otro','Otro']],'Gas')}${textInput('concept','Concepto',{placeholder:'¿En qué se gastó?'})}${numberInput('amount','Importe (MXN)',{min:0.01,step:'0.01'})}${selectInput('method','Medio de pago',METHODS,'efectivo')}<div class="form-span"><label class="field-check"><input type="checkbox" name="fromCash" id="expense-cash"> Se pagó con efectivo tomado de la caja del puesto</label><span class="form-hint">Activar solo cuando el efectivo salió físicamente de esa caja; se resta al corte del día.</span></div><div class="form-span">${textInput('note','Comprobante o comentario',{required:false})}</div></div>`,fd=>{const date=String(fd.get('date'));need(isDate(date),'Fecha inválida.');const branch=String(fd.get('branch')),method=String(fd.get('method')),amount=Number(fd.get('amount'));const fromCash=fd.has('fromCash');need(validAmount(amount)&&amount>0,'El importe debe ser mayor que cero.');need(!fromCash||(branch!=='central'&&method==='efectivo'),'Solo se puede marcar salida de caja con efectivo de una sucursal.');data.expenses.push({id:uid(),date,branch,category:String(fd.get('category')),concept:String(fd.get('concept')).trim(),amount:moneySafe(amount),method,fromCash,note:String(fd.get('note')||'').trim(),created:new Date().toISOString()})},'Guardar gasto',form=>{const update=()=>{const cb=form.querySelector('#expense-cash');if(form.elements.branch.value==='central'||form.elements.method.value!=='efectivo'){cb.checked=false;cb.disabled=true}else cb.disabled=false};form.addEventListener('change',update);update()});}
function openStockStart(){const branch=ui.inventoryBranch;modal('Inventario físico de partida','Registra cuántas porciones hay ANTES del primer día de captura. No se sobrescriben movimientos anteriores.',`<div class="form-grid">${selectInput('branch','Sucursal',BRANCHES.map(b=>[b.id,b.name]),branch)}<div class="form-tip">La base debe reflejar el conteo físico real. Es necesaria para calcular inventario teórico acumulado.</div>${data.products.map(p=>numberInput('stock-'+p.id,sanitize(p.name)+' ('+sanitize(p.unit)+')',{required:false,min:0,step:'0.001',value:data.openingStock[branch][p.id]??'',placeholder:'Sin contar'})).join('')}</div>`,fd=>{const branch=String(fd.get('branch'));for(const p of data.products){const raw=String(fd.get('stock-'+p.id)||'').trim();if(raw===''){data.openingStock[branch][p.id]=null;continue}const q=Number(raw);need(validAmount(q),'Conteo inicial inválido.');data.openingStock[branch][p.id]=q;}ui.inventoryBranch=branch;},'Guardar inventario inicial',form=>{form.elements.branch.addEventListener('change',()=>{const b=form.elements.branch.value;for(const p of data.products)form.elements['stock-'+p.id].value=data.openingStock[b][p.id]??''})});}
function openClosing(){let existing=data.closings.find(c=>c.date===localISO()&&c.branch===ui.cashBranch);const branch=ui.cashBranch;const fields=`<div class="form-grid">${dateInput(existing?.date||localISO())}${branchInput(branch)}${numberInput('float','Fondo inicial de caja (MXN)',{value:existing?.float??0})}${numberInput('withdrawals','Retiros o depósitos desde la caja (MXN)',{value:existing?.withdrawals??0})}<div class="form-span"><div class="total-box"><span class="strong">EFECTIVO ESPERADO</span><strong id="closing-expected">—</strong></div><p class="caption" style="margin-top:8px" id="closing-breakdown"></p></div>${numberInput('cashCount','Efectivo contado al cierre (MXN)',{value:existing?.cashCount??'',placeholder:'Total físico disponible'})}${textInput('manager','Responsable del cierre',{required:false,value:existing?.manager||'',placeholder:'Nombre o iniciales'})}<div class="form-span"><label class="label">Conteo físico por producto (recomendado)</label><div class="grid grid-2" style="margin-top:8px">${data.products.map(p=>numberInput('physical-'+p.id,sanitize(p.name),{required:false,min:0,step:'0.001',value:existing?.stockCounts?.[p.id]??'',placeholder:'No contado'})).join('')}</div></div><div class="form-span">${textInput('note','Observaciones del cierre',{required:false,value:existing?.note||'',placeholder:'Diferencias de caja, faltantes o incidencias'})}</div></div>`;
modal('Corte de caja','Cierre diario: efectivo, inventario y observaciones.',fields,fd=>{const {date,branch}=dateAndBranch(fd);const float=Number(fd.get('float')),withdrawals=Number(fd.get('withdrawals')),cashCount=Number(fd.get('cashCount'));need([float,withdrawals,cashCount].every(validAmount),'El efectivo y los retiros deben ser cantidades válidas no negativas.');const stockCounts={};for(const p of data.products){const v=String(fd.get('physical-'+p.id)||'').trim();if(v==='')continue;const q=Number(v);need(validAmount(q),'Conteo físico inválido.');stockCounts[p.id]=q}const expected=cashExpected(date,branch,float,withdrawals);const record={id:uid(),date,branch,float:moneySafe(float),withdrawals:moneySafe(withdrawals),cashCount:moneySafe(cashCount),difference:moneySafe(cashCount-expected.total),stockCounts,manager:String(fd.get('manager')||'').trim(),note:String(fd.get('note')||'').trim(),created:new Date().toISOString()};const existingIndex=data.closings.findIndex(c=>c.date===date&&c.branch===branch);if(existingIndex>=0)data.closings[existingIndex]={...record,id:data.closings[existingIndex].id};else data.closings.push(record);ui.cashBranch=branch;},'Guardar cierre',form=>{const update=()=>{const branch=form.elements.branch.value,date=form.elements.date.value,float=number(form.elements.float.value),withdrawals=number(form.elements.withdrawals.value);const val=cashExpected(date,branch,float,withdrawals);form.querySelector('#closing-expected').textContent=money(val.total);form.querySelector('#closing-breakdown').textContent=`Fondo ${money(float)} + efectivo cobrado ${money(val.cash)} − gastos de caja ${money(val.cashOut)} − retiros ${money(withdrawals)}.`;const c=data.closings.find(c=>c.date===date&&c.branch===branch);if(c){form.elements.float.value=c.float;form.elements.withdrawals.value=c.withdrawals;form.elements.cashCount.value=c.cashCount;form.elements.manager.value=c.manager||'';form.elements.note.value=c.note||'';for(const p of data.products)form.elements['physical-'+p.id].value=c.stockCounts?.[p.id]??'';const v=cashExpected(date,branch,c.float,c.withdrawals);form.querySelector('#closing-expected').textContent=money(v.total);form.querySelector('#closing-breakdown').textContent=`Fondo ${money(c.float)} + efectivo cobrado ${money(v.cash)} − gastos de caja ${money(v.cashOut)} − retiros ${money(c.withdrawals)}.`}};form.elements.date.addEventListener('change',update);form.elements.branch.addEventListener('change',update);form.elements.float.addEventListener('input',()=>{const b=form.elements.branch.value,v=cashExpected(form.elements.date.value,b,number(form.elements.float.value),number(form.elements.withdrawals.value));form.querySelector('#closing-expected').textContent=money(v.total);form.querySelector('#closing-breakdown').textContent=`Fondo ${money(form.elements.float.value)} + efectivo ${money(v.cash)} − gastos de caja ${money(v.cashOut)} − retiros ${money(form.elements.withdrawals.value)}.`});form.elements.withdrawals.addEventListener('input',()=>{const v=cashExpected(form.elements.date.value,form.elements.branch.value,number(form.elements.float.value),number(form.elements.withdrawals.value));form.querySelector('#closing-expected').textContent=money(v.total)});update();});}
function editTask(id){const t=data.tasks.find(t=>t.id===id);if(!t)return;modal('Actualizar entregable','La validación debe apoyarse en evidencia, no únicamente en un cambio de estatus.',`<div class="form-grid"><div class="form-span"><h3 style="margin:0">${sanitize(t.title)}</h3><p class="section-intro">${sanitize(t.description)}</p></div>${selectInput('status','Estado',[['Pendiente','Pendiente'],['En curso','En curso'],['Validado','Validado']],t.status)}<div class="form-field form-span"><label for="task-note">Nota de avance o evidencia</label><textarea id="task-note" name="note" maxlength="850" placeholder="Qué se hizo, qué falta o qué se validó">${sanitize(t.note||'')}</textarea></div></div>`,fd=>{t.status=String(fd.get('status'));t.note=String(fd.get('note')||'').trim();t.updatedAt=localISO();},'Actualizar progreso');}
function editDocument(id){const d=data.docs.find(d=>d.id===id);if(!d)return;modal('Actualizar documento','Publica únicamente enlaces autorizados. Nunca subas secretos industriales a carpetas públicas.',`<div class="form-grid">${textInput('title','Nombre del documento',{value:d.title})}${selectInput('category','Categoría',[['Operación','Operación'],['Finanzas','Finanzas'],['Personal','Personal'],['Legal','Legal']],d.category)}<div class="form-span">${textInput('description','Descripción',{value:d.description})}</div>${selectInput('status','Estado',[['Por preparar','Por preparar'],['Borrador','Borrador'],['Pendiente de revisión','Pendiente de revisión'],['Publicado','Publicado']],d.status)}<div class="form-span">${textInput('url','Enlace de consulta (opcional)',{required:false,value:d.url||'',type:'url',placeholder:'https://drive.google.com/...',hint:'Preferir una carpeta con permisos de acceso, no enlaces públicos para documentos sensibles.'})}</div><div class="form-field form-span"><label for="doc-note">Nota de avance</label><textarea id="doc-note" name="note" maxlength="800">${sanitize(d.note||'')}</textarea></div></div>`,fd=>{const url=String(fd.get('url')||'').trim(),status=String(fd.get('status'));need(!url||!!safeURL(url),'El enlace debe empezar con https:// o http://');need(status!=='Publicado'||!!safeURL(url),'Un documento publicado necesita un enlace de consulta.');Object.assign(d,{title:String(fd.get('title')).trim(),category:String(fd.get('category')),description:String(fd.get('description')).trim(),status,url,note:String(fd.get('note')||'').trim(),updatedAt:localISO()})},'Guardar documento');}
function newDocument(){modal('Añadir documento','Agrega un documento o una nueva entrega al proyecto.',`<div class="form-grid">${textInput('title','Nombre del documento')}${selectInput('category','Categoría',[['Operación','Operación'],['Finanzas','Finanzas'],['Personal','Personal'],['Legal','Legal']],'Operación')}<div class="form-span">${textInput('description','Descripción')}</div>${selectInput('status','Estado',[['Por preparar','Por preparar'],['Borrador','Borrador'],['Pendiente de revisión','Pendiente de revisión'],['Publicado','Publicado']],'Por preparar')}<div class="form-span">${textInput('url','Enlace de consulta (opcional)',{required:false,type:'url',placeholder:'https://...'})}</div></div>`,fd=>{const url=String(fd.get('url')||'').trim(),status=String(fd.get('status'));need(!url||!!safeURL(url),'Solo se admiten enlaces http(s).');need(status!=='Publicado'||!!url,'Un documento publicado necesita enlace.');data.docs.push({id:uid(),title:String(fd.get('title')).trim(),description:String(fd.get('description')).trim(),category:String(fd.get('category')),status,url,note:'',updatedAt:localISO()})},'Añadir entregable');}
function editProduct(id){
  requireAdmin();
  if(!authState.catalogSynced||!authState.client){toast('El catálogo remoto aún no está confirmado.','error');return}
  const p=data.products.find(row=>row.id===id),isNew=!id;
  if(!isNew&&!p){toast('No se encontró el producto seleccionado. Actualiza el catálogo.','error');return}
  const html=`<div class="form-grid">${textInput('name','Nombre del producto',{value:p?.name||''})}${textInput('unit','Unidad de venta',{value:p?.unit||'porción'})}${numberInput('price','Precio de venta (MXN)',{required:false,min:0.01,value:p?.price??''})}${textInput('detail','Descripción de la presentación',{required:false,value:p?.detail||''})}<label class="field-check"><input name="active" type="checkbox" ${p?.active!==false?'checked':''}> Producto activo</label></div>`;
  modal(isNew?'Añadir presentación':'Editar producto','Los cambios se guardan directamente en Supabase.',html,async(fd,form)=>{
    requireAdmin();
    const name=String(fd.get('name')||'').trim(),unit=String(fd.get('unit')||'').trim(),detail=String(fd.get('detail')||'').trim(),raw=String(fd.get('price')||'').trim();
    need(name&&unit,'Nombre y unidad son obligatorios.');
    const price=raw===''?null:Number(raw);
    need(price===null||(Number.isFinite(price)&&price>0),'El precio debe ser mayor que cero.');
    const payload={name,unit,detail,sale_price:price,active:fd.get('active')==='on',updated_at:new Date().toISOString()};
    return await saveProductToSupabase(payload,id,form,form.querySelector('[type="submit"]'));
  },'Guardar producto');
}
function openVoidSale(s){
  requireAdmin();const dlg=document.getElementById('dialog'),target=document.getElementById('dialog-content');
  target.innerHTML=`<form id="void-sale-form"><div class="modal-header"><div><h2>Anular venta</h2><p>Esta acción conserva partidas y pagos; no puede deshacerse.</p></div><button type="button" class="icon-button" data-modal-close>${I('x')}</button></div><div class="modal-body"><div class="subtle-banner">${I('alert')} <div><strong>${sanitize(s.ticket)}</strong> · ${money(s.total)}. Se registrará tu usuario, la fecha y el motivo en la bitácora.</div></div><div class="form-field"><label for="void-reason">Motivo obligatorio</label><textarea id="void-reason" name="reason" maxlength="400" required></textarea></div><div id="void-sale-result" class="mini-note" hidden role="status"></div></div><div class="modal-footer"><button type="button" class="btn btn-ghost" data-modal-close>Cancelar</button><button type="submit" class="btn btn-danger">Confirmar anulación</button></div></form>`;
  const form=target.querySelector('#void-sale-form'),result=target.querySelector('#void-sale-result'),submit=form.querySelector('[type="submit"]');
  target.querySelectorAll('[data-modal-close]').forEach(el=>el.addEventListener('click',()=>{if(form.dataset.saving!=='true')dlg.close()}));
  form.addEventListener('submit',async event=>{event.preventDefault();if(form.dataset.saving==='true')return;result.hidden=false;const reason=form.elements.reason.value.trim();if(!reason){result.textContent='Indica el motivo de la anulación.';return}form.dataset.saving='true';submit.disabled=true;submit.textContent='Anulando…';try{const confirmation=await voidSale(authState.client,s.id,reason);await refreshRemoteSales();result.textContent=`Venta ${confirmation.ticket} anulada y auditada.`;submit.textContent='Venta anulada';render();}catch(error){result.textContent=error.message||'No se pudo anular el ticket.';submit.disabled=false;submit.textContent='Confirmar anulación';}finally{form.dataset.saving='false'}});
  dlg.showModal();
}
function saleDetail(id){const s=authState.remoteSales.find(s=>s.id===id)||data.sales.find(s=>s.id===id);if(!s)return;const list=s.items.map(i=>`<div class="metric-line"><span>${integer(i.qty)} × ${sanitize(productName(i.productId))} (${money(i.unitPrice)})</span><strong>${money(i.qty*i.unitPrice)}</strong></div>`).join('');const payments=s.payments.map(p=>`<div class="metric-line"><span>${sanitize(methodName(p.method))}</span><strong>${money(p.amount)}</strong></div>`).join('');const dlg=document.getElementById('dialog');document.getElementById('dialog-content').innerHTML=`<div class="modal-header"><div><h2>Detalle de ticket</h2><p>${sanitize(s.ticket)} · ${sanitize(fmtDate(s.date))} · ${sanitize(branchName(s.branch))}</p></div><button type="button" class="icon-button" data-modal-close>${I('x')}</button></div><div class="modal-body"><h3>Productos</h3>${list}<div class="divider"></div><h3>Pagos registrados</h3>${payments}<div class="total-box" style="margin-top:17px"><span>TOTAL</span><strong>${money(s.total)}</strong></div>${s.reference?`<p class="caption" style="margin-top:13px">Referencia: ${sanitize(s.reference)}</p>`:''}${s.note?`<p class="caption">Nota: ${sanitize(s.note)}</p>`:''}${s.voidedAt?`<div class="subtle-banner" style="margin-top:15px">Ticket anulado: ${sanitize(s.voidReason||'Sin motivo')}</div>`:''}</div><div class="modal-footer"><button type="button" class="btn btn-ghost" data-modal-close>Cerrar</button>${s.source==='supabase'?`<button type="button" class="btn btn-secondary" id="reprint-sale">${I('clipboard')} Reimprimir ticket</button>`:''}${isAdmin()&&!s.voidedAt&&s.source==='supabase'?`<button type="button" class="btn btn-danger" id="void-sale">${I('x')} Anular ticket</button>`:''}</div>`;dlg.querySelectorAll('[data-modal-close]').forEach(el=>el.addEventListener('click',()=>dlg.close()));if(s.source==='supabase')dlg.querySelector('#reprint-sale').addEventListener('click',()=>printConfirmedTicket(s));if(isAdmin()&&!s.voidedAt&&s.source==='supabase')dlg.querySelector('#void-sale').addEventListener('click',()=>void openVoidSale(s));dlg.showModal()}
function downloadFile(filename,content,mime){const url=URL.createObjectURL(new Blob([content],{type:mime}));const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000)}
function exportJSON(){try{const raw=localStorage.getItem(KEY);downloadFile(`Plebes-Wings-historial-local-${localISO()}.json`,JSON.stringify(localExport(raw),null,2),"application/json;charset=utf-8");toast("Exportación manual del historial local descargada.");return true}catch{toast("No fue posible leer el historial local. No se modificaron datos.","error");return false}}
function csvSafe(value){const s=String(value??'');const safe=/^[\s]*[=+\-@\t\r]/.test(s)?"'"+s:s;return '"'+safe.replaceAll('"','""')+'"'}
function exportCSV(){requireAdmin();const headers=['Origen','Fecha de exportación','Fecha','Sucursal','Ticket','Productos','Forma de pago','Monto MXN','Anulado','Motivo'];const rows=data.sales.map(s=>['localStorage',new Date().toISOString(),s.date,branchName(s.branch),s.ticket,s.items.map(i=>`${i.qty} x ${productName(i.productId)}`).join(' / '),s.payments.map(p=>methodName(p.method)+' '+money(p.amount)).join(' / '),s.total,s.voidedAt?'Sí':'No',s.voidReason||'']);downloadFile(`Plebes-Wings-ventas-${localISO()}.csv`,'\ufeff'+[headers,...rows].map(row=>row.map(csvSafe).join(',')).join('\r\n'),'text/csv;charset=utf-8');toast('Ventas CSV descargadas.')}
async function importJSON(file){if(!file)return;try{requireAdmin();need(file.size<=10*1024*1024,"El archivo supera 10 MB.");const current=JSON.parse(localStorage.getItem(KEY)||"{}");const rows=previewLegacyImport(await file.text(),current);requireAdmin();const dlg=document.getElementById("dialog");document.getElementById("dialog-content").innerHTML=`<div class="modal-header"><h2>Vista previa de migración</h2></div><div class="modal-body"><p>Validación estructural inicial. Duplicados por identificador frente al historial local; falta comparar con Supabase y validar fechas, importes y relaciones. No se importó ningún registro.</p>${table(["Módulo","Registros","ID ya local","ID nuevo local"],rows.map(r=>`<tr><td>${sanitize(r.module)}</td><td>${r.count}</td><td>${r.duplicates}</td><td>${r.newRecords}</td></tr>`).join(""))}<p>La migración requiere mapeo del esquema real, revisión de duplicados en servidor, pruebas y confirmación administrativa. La escritura permanece bloqueada.</p></div><div class="modal-footer"><button type="button" class="btn btn-ghost" id="preview-close">Cerrar</button></div>`;document.getElementById("preview-close").onclick=()=>dlg.close();dlg.showModal()}catch(e){toast("No se pudo revisar el archivo: "+e.message,"error")}}
function clickAction(btn){
  requireAuthorized();
  const action=btn.dataset.action,id=btn.dataset.id;
  if(isEmployee()&&!['sale-new','sale-preview','sale-detail'].includes(action)){
    toast('Esta acción está reservada para administración.','error');return;
  }
  if(['product-edit','product-new'].includes(action)&&(!authState.catalogSynced||!authState.client)){
    toast('El catálogo requiere una conexión autenticada con Supabase.','error');return;
  }
  switch(action){
    case'go-ruta':location.hash='#ruta';break;
    case'go-ajustes':location.hash='#ajustes';break;
    case'sale-new':openSale();break;
    case'sale-preview':openSale();break;
    case'legal-open':void openPrivateLegalDocument(id);break;
    case'legal-upload':{if(!findLegalDocument(id)){toast('Documento no identificado.','error');break}const input=document.getElementById('legal-file-input');input.dataset.docId=id;input.click();break;}
    case'supplier-new':openCatalogRecord('supplier');break;
    case'inventory-item-new':openCatalogRecord('item');break;
    case'inventory-opening':openInventoryMovement('opening');break;
    case'inventory-transfer':openStockTransfer();break;
    case'inventory-waste':openInventoryMovement('waste');break;
    case'cash-open':openCashOperation('open');break;
    case'cash-close':openCashOperation('close');break;
    case'finance-expense':openRemoteExpense();break;
    case'delivery-new':openDelivery();break;
    case'purchase-new':openPurchase();break;
    case'purchase-confirm':void transitionPurchase(id,'confirm');break;
    case'purchase-receive':void transitionPurchase(id,'receive');break;
    case'purchase-void':void transitionPurchase(id,'void');break;
    case'waste-new':openWaste();break;
    case'expense-new':openExpense();break;
    case'stock-start':openStockStart();break;
    case'closing-new':openClosing();break;
    case'task-edit':editTask(id);break;
    case'doc-edit':editDocument(id);break;
    case'doc-new':newDocument();break;
    case'product-edit':editProduct(id);break;
    case'product-new':editProduct(null);break;
    case'sale-detail':saleDetail(id);break;
    case'export-json':exportJSON();break;
    case'export-csv':exportCSV();break;
    case'import-json':document.getElementById('import-data').click();break;
    case'abasto-tab':ui.abastoTab=id;render();break;
  }
}
document.addEventListener('click',e=>{const btn=e.target.closest('[data-action]');if(btn){e.preventDefault();clickAction(btn)}});
document.addEventListener('change',e=>{const el=e.target.closest('[data-change]');if(!el)return;const val=el.value;switch(el.dataset.change){case'home-branch':ui.branch=val;break;case'sales-branch':ui.salesBranch=val;break;case'stock-branch':ui.inventoryBranch=val;break;case'cash-branch':ui.cashBranch=val;break;case'finance-branch':ui.financeBranch=val;break;}render()});
function setNav(open,{returnFocus=false}={}){const side=document.getElementById('sidebar'),backdrop=document.getElementById('nav-backdrop'),toggle=document.getElementById('menu-toggle');const isCompact=window.matchMedia('(max-width: 940px)').matches;if(!isCompact)open=false;side.classList.toggle('open',open);backdrop.hidden=!open;document.body.classList.toggle('nav-open',open);toggle.setAttribute('aria-expanded',String(open));toggle.setAttribute('aria-label',open?'Cerrar menú':'Abrir menú');if(open){const firstLink=side.querySelector('.nav-item');if(firstLink)firstLink.focus()}else if(returnFocus)toggle.focus()}
function toggleNav(){setNav(!document.getElementById('sidebar').classList.contains('open'))}
document.getElementById('menu-toggle').addEventListener('click',toggleNav);document.getElementById('nav-backdrop').addEventListener('click',()=>setNav(false,{returnFocus:true}));
document.querySelectorAll('#sidebar .nav-item').forEach(link=>link.addEventListener('click',()=>setNav(false)));
document.getElementById('import-data').addEventListener('change',e=>{importJSON(e.target.files?.[0]);e.target.value='' });
document.getElementById('legal-file-input').addEventListener('change',e=>{const id=e.target.dataset.docId,file=e.target.files?.[0];e.target.value='';if(file)void receivePrivateLegalDocument(id,file);});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.getElementById('sidebar').classList.contains('open'))setNav(false,{returnFocus:true})});
window.addEventListener('resize',()=>{if(!window.matchMedia('(max-width: 940px)').matches)setNav(false)});
window.addEventListener('hashchange',()=>{render();window.scrollTo({top:0,behavior:'instant'})});
document.querySelectorAll('[data-icon]').forEach(el=>{el.innerHTML=I(el.dataset.icon)});
const authForm=document.getElementById('auth-form');
const authSubmit=document.getElementById('auth-submit');
authSubmit.addEventListener('click',()=>{void submitLogin()});
authForm.addEventListener('keydown',event=>{if(event.key==='Enter'&&(event.target.id==='auth-email'||event.target.id==='auth-password')){event.preventDefault();if(!authSubmit.disabled)void submitLogin()}});
document.getElementById('sign-out').addEventListener('click',()=>{void logout()});
document.getElementById('auth-retry').addEventListener('click',()=>{if(authState.blocked)void logout();else void initializeAuth()});
async function boot(){if(!location.hash)history.replaceState(null,'','#inicio');await initializeAuth()}
boot();
