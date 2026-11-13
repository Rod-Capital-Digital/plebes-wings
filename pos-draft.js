/* Non-accounting, per-user POS draft. Local only: never a registered sale or payment. */
const PREFIX='plebes-pos-draft-v1:';
const MAX_AGE=72*60*60*1000;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const key=userId=>PREFIX+String(userId||'');
const allowedPayments=new Set(['efectivo','tarjeta','transferencia','mixto']);
export function readPosDraft(storage,userId,products,branches,now=Date.now()){
 if(!storage||!UUID.test(String(userId||'')))return null;
 try{
  const original=storage.getItem(key(userId));if(!original)return null;
  const draft=JSON.parse(original);
  if(draft?.version!==1||!Number.isFinite(draft.savedAt)||draft.savedAt>now+60000||now-draft.savedAt>MAX_AGE||!UUID.test(String(draft.requestId||''))){storage.removeItem(key(userId));return null}
  const allowed=new Set((products||[]).filter(p=>p.active!==false&&p.price!=null&&Number(p.price)>0).map(p=>p.id));
  const quantities={};for(const [id,raw] of Object.entries(draft.quantities||{})){
   const qty=Number(raw);if(allowed.has(id)&&Number.isInteger(qty)&&qty>0&&qty<=999)quantities[id]=qty;
  }
  if(!Object.keys(quantities).length){storage.removeItem(key(userId));return null}
  const branch=branches.some(b=>b.id===draft.branch)?draft.branch:branches[0]?.id;
  if(!branch)return null;
  return {quantities,requestId:draft.requestId,branch,payment:allowedPayments.has(draft.payment)?draft.payment:'efectivo',paper:draft.paper==='58'?'58':'80',note:typeof draft.note==='string'?draft.note.slice(0,400):'',uncertain:Boolean(draft.uncertain)};
 }catch{return null}
}
export function writePosDraft(storage,userId,draft,now=Date.now()){
 if(!storage||!UUID.test(String(userId||''))||!UUID.test(String(draft?.requestId||'')))return false;
 const quantities={};for(const [id,raw] of Object.entries(draft.quantities||{})){
  if(!/^[\w-]{1,90}$/.test(id))continue;
  const qty=Number(raw);if(Number.isInteger(qty)&&qty>0&&qty<=999)quantities[id]=qty;
 }
 try{
  if(!Object.keys(quantities).length){storage.removeItem(key(userId));return true}
  storage.setItem(key(userId),JSON.stringify({version:1,savedAt:now,requestId:draft.requestId,quantities,branch:String(draft.branch||''),payment:allowedPayments.has(draft.payment)?draft.payment:'efectivo',paper:draft.paper==='58'?'58':'80',note:String(draft.note||'').slice(0,400),uncertain:Boolean(draft.uncertain)}));return true;
 }catch{return false}
}
export function clearPosDraft(storage,userId){try{storage?.removeItem(key(userId));return true}catch{return false}}
