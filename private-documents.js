/* Registro de documentos existentes; los archivos NO se incluyen en el sitio público. */
export const PRIVATE_DOCUMENTS_BUCKET = 'pw-internal-documents';
export const LEGAL_DOCUMENTS = Object.freeze([
  Object.freeze({id:'pw-leg-01',code:'PW-LEG-01',title:'Convenio de confidencialidad y protección de información reservada',file:'PW_01_Convenio_Confidencialidad_V2.docx',version:'1.0 · 09 nov 2026',category:'Legal',summary:'Protege recetas, formulaciones, contraseñas, credenciales y datos comerciales. No impone una prohibición general de competencia.',pending:'Completar identificación del titular, RFC, domicilio, puesto y canales internos; revisión jurídica y firma.'}),
  Object.freeze({id:'pw-leg-02',code:'PW-LEG-02',title:'Aviso de privacidad integral para personal',file:'PW_02_Aviso_Privacidad_Personal_V2.docx',version:'1.0 · 09 nov 2026',category:'Datos personales',summary:'Describe tratamientos de datos laborales, bancarios, fiscales y operativos, así como los derechos de las personas titulares.',pending:'Completar responsable, RFC, domicilio, medios para derechos ARCO, finalidad y mecanismo de comunicación.'}),
  Object.freeze({id:'pw-ops-03',code:'PW-OPS-03',title:'Política integral de operación, tickets y seguridad digital',file:'PW_03_Politica_Tickets_Inventario_Seguridad_V2.docx',version:'1.0 · 09 nov 2026',category:'Operación',summary:'Define tickets, controles de ventas, inventario, devoluciones, confidencialidad y accesos. Incluye una propuesta de garantía por falta de ticket.',pending:'Validación del titular, canales oficiales, capacitación y controles de POS; no anunciar la garantía antes de implementar sus requisitos.'})
]);

export function findLegalDocument(id){return LEGAL_DOCUMENTS.find(d=>d.id===id)||null}
export function legalDocumentFolder(id){if(!findLegalDocument(id))throw new Error('Documento desconocido.');return `legal/${id}`}
export function validateLegalUpload(file){
  if(!file||typeof file.name!=='string')throw Error('Selecciona un archivo DOCX o PDF.');
  const extension=file.name.toLowerCase().split('.').pop();
  if(!['docx','pdf'].includes(extension))throw Error('Solo se permiten archivos DOCX o PDF.');
  if(!Number.isSafeInteger(file.size)||file.size<=0||file.size>8*1024*1024)throw Error('Archivo vacío o mayor a 8 MB.');
  const types={docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',pdf:'application/pdf'};
  if(file.type&&file.type!==types[extension]&&file.type!=='application/octet-stream')throw Error('El tipo del archivo no corresponde a su extensión.');
  return extension;
}
function storage(client){if(!client?.storage?.from)throw Error('No hay conexión autenticada al almacenamiento privado.');return client.storage.from(PRIVATE_DOCUMENTS_BUCKET)}
export async function listLegalVersions(client,id){
  const {data,error}=await storage(client).list(legalDocumentFolder(id),{limit:100,sortBy:{column:'created_at',order:'desc'}});
  if(error)throw Error('El almacén privado no está disponible o no tienes autorización.');
  return (Array.isArray(data)?data:[]).filter(x=>x&&typeof x.name==='string'&&/\.(docx|pdf)$/i.test(x.name)&&x.id).sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||'')));
}
export async function signLegalDocument(client,id){
  const files=await listLegalVersions(client,id);
  if(!files.length)throw Error('Todavía no hay una versión cargada en el almacén privado.');
  const path=`${legalDocumentFolder(id)}/${files[0].name}`;
  const {data,error}=await storage(client).createSignedUrl(path,60,{download:files[0].name});
  if(error||!data?.signedUrl)throw Error('No se pudo crear el enlace temporal de acceso.');
  const url=new URL(data.signedUrl);
  if(!['https:','http:'].includes(url.protocol))throw Error('Respuesta de almacenamiento inválida.');
  return url.href;
}
export async function uploadLegalDocument(client,id,file){
  const extension=validateLegalUpload(file);
  const path=`${legalDocumentFolder(id)}/${new Date().toISOString().replace(/[:.]/g,'-')}-${crypto.randomUUID()}.${extension}`;
  const {data,error}=await storage(client).upload(path,file,{contentType:extension==='pdf'?'application/pdf':'application/vnd.openxmlformats-officedocument.wordprocessingml.document',upsert:false,cacheControl:'0'});
  if(error||!data?.path)throw Error('No se confirmó la carga al almacén privado. Revisa los permisos de Storage.');
  const versions=await listLegalVersions(client,id);
  if(!versions.some(x=>`${legalDocumentFolder(id)}/${x.name}`===data.path))throw Error('El servidor recibió el archivo, pero no pudo verificarse su lectura. No repitas la carga sin revisar primero las versiones.');
  return data.path;
}
