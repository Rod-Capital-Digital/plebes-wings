const family={kg:'mass',g:'mass',l:'volume',ml:'volume',porción:'count',pieza:'count',unidad:'count',vaso:'count',jarra:'count'};
const factor={kg:1,g:0.001,l:1,ml:0.001,porción:1,pieza:1,unidad:1,vaso:1,jarra:1};
export function convertToBase(quantity,unit,baseUnit){const q=Number(quantity);if(!Number.isFinite(q)||q<=0||!family[unit]||!family[baseUnit]||family[unit]!==family[baseUnit])throw Error('Unidad incompatible o cantidad inválida.');return q*factor[unit]/factor[baseUnit]}
export function calculateRecipeCost({lines=[],items=[],costs=[],yieldUnits=1,wastePercent=0,price=null}){
 const yieldValue=Number(yieldUnits),waste=Number(wastePercent);if(!Number.isFinite(yieldValue)||yieldValue<=0||!Number.isFinite(waste)||waste<0||waste>=100)throw Error('Rendimiento o merma inválidos.');
 let subtotal=0,incomplete=[];if(!Array.isArray(lines)||!lines.length)return {complete:false,incompleteItemIds:[],ingredientCost:null,unitCost:null,margin:null,marginPercent:null};for(const line of lines){const item=items.find(x=>x.id===line.item_id),cost=costs.find(x=>x.item_id===line.item_id&&x.active!==false);if(!item||!cost||cost.cost_per_base_unit===null||cost.cost_per_base_unit===undefined||cost.cost_per_base_unit===''||!Number.isFinite(Number(cost.cost_per_base_unit))||Number(cost.cost_per_base_unit)<0){incomplete.push(line.item_id);continue}subtotal+=convertToBase(line.quantity,line.unit||item.base_unit,item.base_unit)*Number(cost.cost_per_base_unit)}
 const unitCost=incomplete.length?null:subtotal/(yieldValue*(1-waste/100)),sale=price===null||price===undefined||price===''?NaN:Number(price);return {complete:!incomplete.length,incompleteItemIds:[...new Set(incomplete)],ingredientCost:incomplete.length?null:subtotal,unitCost,margin:unitCost!==null&&Number.isFinite(sale)?sale-unitCost:null,marginPercent:unitCost!==null&&Number.isFinite(sale)&&sale>0?(sale-unitCost)/sale*100:null};
}

const queryError=(result,label)=>{if(result?.error)throw Error(`No se pudo consultar ${label}: ${result.error.message||'error de Supabase'}`);return Array.isArray(result?.data)?result.data:[]};
const currentCostByItem=costs=>{
 const byItem=new Map();
 for(const cost of costs||[]){
  if(!cost?.item_id||cost.cost_per_base_unit===null||cost.cost_per_base_unit===undefined)continue;
  const previous=byItem.get(cost.item_id),stamp=`${cost.effective_on||''}|${cost.created_at||''}`;
  if(!previous||stamp>`${previous.effective_on||''}|${previous.created_at||''}`)byItem.set(cost.item_id,cost);
 }
 return [...byItem.values()];
};

// Read-only recipe snapshot. Costs are intentionally optional because RLS may
// deny them to otherwise authorized recipe readers.
export async function loadRecipeCosts(client){
 if(!client?.from)throw Error('Se requiere una conexión autenticada a Supabase.');
 const [productsResult,versionsResult,linesResult,itemsResult]=await Promise.all([
  client.from('pw_products').select('id,name,unit,sale_price,detail,active').eq('active',true).order('name'),
  client.from('pw_recipe_versions').select('id,product_id,name,version_no,valid_from,yield_units,waste_percent,status,created_at').order('product_id').order('version_no',{ascending:false}),
  client.from('pw_recipe_lines').select('id,recipe_version_id,item_id,quantity,unit').order('recipe_version_id'),
  client.from('pw_inventory_items').select('id,name,base_unit,item_type,product_id,active').eq('active',true).order('name')
 ]);
 const products=queryError(productsResult,'productos'),versions=queryError(versionsResult,'versiones de receta'),lines=queryError(linesResult,'partidas de receta'),items=queryError(itemsResult,'artículos de inventario');
 let costs=[],costAccess='available',costError='';
 try{
  const result=await client.from('pw_inventory_item_costs').select('item_id,cost_per_base_unit,effective_on,created_at').order('effective_on',{ascending:false}).order('created_at',{ascending:false});
  costs=currentCostByItem(queryError(result,'costos de inventario'));
 }catch(error){costAccess='unavailable';costError=error.message||'No se pudieron consultar los costos.';}
 return {products,versions,lines,items,costs,costAccess,costError};
}

export function buildRecipeOverview(snapshot){
 const products=Array.isArray(snapshot?.products)?snapshot.products:[],versions=Array.isArray(snapshot?.versions)?snapshot.versions:[],lines=Array.isArray(snapshot?.lines)?snapshot.lines:[],items=Array.isArray(snapshot?.items)?snapshot.items:[],costs=Array.isArray(snapshot?.costs)?snapshot.costs:[];
 const byProduct=new Map();
 for(const version of versions){
  const previous=byProduct.get(version.product_id);
  // The active version wins, otherwise use the newest version supplied by the query.
  if(!previous||version.status==='active'||(previous.status!=='active'&&Number(version.version_no)>Number(previous.version_no)))byProduct.set(version.product_id,version);
 }
 const rows=products.map(product=>{
  const recipe=byProduct.get(product.id)||null,recipeLines=recipe?lines.filter(line=>line.recipe_version_id===recipe.id):[];
  const cost=recipe?calculateRecipeCost({lines:recipeLines,items,costs,yieldUnits:recipe.yield_units,wastePercent:recipe.waste_percent,price:product.sale_price}):{complete:false,ingredientCost:null,unitCost:null,margin:null,marginPercent:null,incompleteItemIds:[]};
  return {product,recipe,lines:recipeLines,items:recipeLines.map(line=>items.find(item=>item.id===line.item_id)).filter(Boolean),cost};
 });
 const active=rows.filter(row=>row.recipe?.status==='active').length,draft=rows.filter(row=>row.recipe?.status==='draft').length,withoutRecipe=rows.filter(row=>!row.recipe).length,completeCosts=rows.filter(row=>row.recipe&&row.cost.complete).length;
 return {rows,summary:{products:products.length,active,draft,withoutRecipe,completeCosts,pendingCosts:Math.max(0,products.length-completeCosts)}};
}
export function validateRecipeVersion(recipe){if(!recipe?.product_id||!String(recipe.name||'').trim())throw Error('Producto y nombre de receta son obligatorios.');if(!Array.isArray(recipe.lines)||!recipe.lines.length)throw Error('La receta requiere al menos un ingrediente.');const seen=new Set();for(const line of recipe.lines){if(!line?.item_id||seen.has(line.item_id)||!Number.isFinite(Number(line.quantity))||Number(line.quantity)<=0)throw Error('Ingredientes inválidos o repetidos.');seen.add(line.item_id)}return true}
export function planSaleConsumption({saleId,branchId,items,recipes}){if(!saleId||!branchId)throw Error('Venta o sucursal inválida.');const rows=[];for(const sold of items||[]){const recipe=recipes.find(r=>r.product_id===sold.product_id&&r.status==='active');if(!recipe||recipe.complete===false)continue;for(const line of recipe.lines||[])rows.push({sale_id:saleId,branch_id:branchId,recipe_version_id:recipe.id,item_id:line.item_id,quantity:Number(line.quantity)*Number(sold.quantity)})}return rows}
