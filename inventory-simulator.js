const LOCATIONS=Object.freeze(['central','mora','santacruz']);
const clone=value=>structuredClone(value);
const validQty=value=>Number.isFinite(Number(value))&&Number(value)>0&&Math.round(Number(value)*1000)===Number(value)*1000;
const key=(location,item)=>`${location}:${item}`;
const now=()=>new Date().toISOString();

export function createInventorySimulator(){
 let state={kind:'SIMULATED_ONLY',items:{},balances:{},movements:[],requests:{}};
 const balance=(location,item)=>Number(state.balances[key(location,item)]||0);
 const record=(movement)=>{state.movements.push({id:`sim-${state.movements.length+1}`,at:now(),...movement});state.balances[key(movement.location_id,movement.item_id)]=balance(movement.location_id,movement.item_id)+Number(movement.quantity);};
 const requireItem=item=>{if(!state.items[item])throw Error('Artículo simulado inexistente.');};
 return {
  snapshot:()=>clone(state),
  addItem({id,name,unit}){if(!id||!name||!['kg','g','l','ml','pieza'].includes(unit)||state.items[id])throw Error('Artículo simulado inválido.');state.items[id]={id,name,unit};return this.snapshot();},
  opening({request_id,item_id,quantity,reason='conteo simulado'}){requireItem(item_id);if(!request_id||!validQty(quantity)||balance('central',item_id)!==0)throw Error('Saldo inicial simulado inválido.');if(state.requests[request_id])return this.snapshot();state.requests[request_id]={kind:'opening'};record({request_id,type:'opening',location_id:'central',item_id,quantity:Number(quantity),reason});return this.snapshot();},
  deliver({request_id,destination_location_id,lines,responsible='Responsable simulado'}){
   if(!request_id||!['mora','santacruz'].includes(destination_location_id)||!Array.isArray(lines)||!lines.length||!responsible.trim())throw Error('Entrega simulada inválida.');
   const fingerprint=JSON.stringify({destination_location_id,lines,responsible});
   if(state.requests[request_id]){if(state.requests[request_id].fingerprint!==fingerprint)throw Error('Solicitud simulada reutilizada con cambios.');return this.snapshot();}
   const ids=new Set();for(const line of lines){requireItem(line?.item_id);if(ids.has(line.item_id)||!validQty(line.quantity)||balance('central',line.item_id)<Number(line.quantity))throw Error('Saldo simulado insuficiente o partida inválida.');ids.add(line.item_id);}
   state.requests[request_id]={kind:'delivery',fingerprint};for(const line of lines){record({request_id,type:'transfer_out',location_id:'central',item_id:line.item_id,quantity:-Number(line.quantity),responsible});record({request_id,type:'transfer_in',location_id:destination_location_id,item_id:line.item_id,quantity:Number(line.quantity),responsible});}return this.snapshot();
  },
  waste({request_id,location_id,item_id,quantity,reason='merma simulada'}){requireItem(item_id);if(!request_id||!LOCATIONS.includes(location_id)||!validQty(quantity)||balance(location_id,item_id)<Number(quantity))throw Error('Merma simulada inválida o sin existencias.');if(state.requests[request_id])return this.snapshot();state.requests[request_id]={kind:'waste'};record({request_id,type:'waste',location_id,item_id,quantity:-Number(quantity),reason});return this.snapshot();}
 };
}

export function runInventorySimulationScenario(){
 const sim=createInventorySimulator();
 sim.addItem({id:'sim-pollo',name:'[SIMULADO] Pollo',unit:'kg'});
 sim.opening({request_id:'sim-opening-pollo',item_id:'sim-pollo',quantity:20});
 sim.deliver({request_id:'sim-mora-001',destination_location_id:'mora',lines:[{item_id:'sim-pollo',quantity:5}],responsible:'Entrega simulada'});
 sim.deliver({request_id:'sim-santacruz-001',destination_location_id:'santacruz',lines:[{item_id:'sim-pollo',quantity:4}],responsible:'Entrega simulada'});
 sim.waste({request_id:'sim-merma-mora-001',location_id:'mora',item_id:'sim-pollo',quantity:.5});
 sim.deliver({request_id:'sim-mora-001',destination_location_id:'mora',lines:[{item_id:'sim-pollo',quantity:5}],responsible:'Entrega simulada'});
 let insufficientRejected=false;try{sim.deliver({request_id:'sim-insufficient',destination_location_id:'mora',lines:[{item_id:'sim-pollo',quantity:99}],responsible:'Entrega simulada'});}catch{insufficientRejected=true;}
 return {...sim.snapshot(),insufficientRejected};
}
