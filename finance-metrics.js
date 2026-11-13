/* Indicadores de compras RECEPCIONADAS; no confundir compras ordenadas con costo vendido. */
const cents=value=>Math.round((Number(value)+Number.EPSILON)*100);
export function calculateReceivedPurchaseValue(doc){
 if(!doc||!['received','partially_received'].includes(doc.status))return {amount:0,complete:true};
 if(Array.isArray(doc.receipts)&&doc.receipts.length){
  const prices=new Map((doc.lines||[]).map(line=>[line.id,Number(line.unitCost)]));
  let sum=0;
  for(const receipt of doc.receipts){for(const line of receipt.lines||[]){
   const price=prices.get(line.purchaseLineId),quantity=Number(line.quantity);
   if(!Number.isFinite(price)||price<0||!Number.isFinite(quantity)||quantity<=0)return {amount:null,complete:false};
   sum+=cents(price*quantity);
  }}
  return {amount:sum/100,complete:true};
 }
 // Las compras recibidas ANTES de la migración 17 son recepciones completas.
 if(doc.status==='received'&&Number.isFinite(Number(doc.total)))return {amount:Number(doc.total),complete:true};
 return {amount:null,complete:false};
}
export function sumReceivedPurchases(documents,location='all'){
 let centsTotal=0,incomplete=0;
 for(const doc of documents||[]){if(location!=='all'&&doc.locationId!==location)continue;
  const value=calculateReceivedPurchaseValue(doc);
  if(!value.complete){incomplete++;continue}
  centsTotal+=cents(value.amount);
 }
 return {amount:centsTotal/100,incomplete};
}
