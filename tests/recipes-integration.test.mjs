import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {convertToBase,calculateRecipeCost,validateRecipeVersion,planSaleConsumption,loadRecipeCosts,buildRecipeOverview} from '../recipes-integration.js';
const sql=readFileSync(new URL('../sql/16_RECIPES_AND_COSTS_REVIEW.sql',import.meta.url),'utf8');
test('conversions respect mass, volume and incompatible units',()=>{assert.equal(convertToBase(250,'g','kg'),0.25);assert.equal(convertToBase(500,'ml','l'),0.5);assert.throws(()=>convertToBase(1,'kg','l'),/incompatible/);});
test('cost remains incomplete when a real ingredient cost is absent',()=>{const r=calculateRecipeCost({lines:[{item_id:'a',quantity:100,unit:'g'},{item_id:'b',quantity:1,unit:'pieza'}],items:[{id:'a',base_unit:'kg'},{id:'b',base_unit:'pieza'}],costs:[{item_id:'a',cost_per_base_unit:80}],yieldUnits:1,wastePercent:0,price:100});assert.equal(r.complete,false);assert.equal(r.unitCost,null);});
test('cost applies conversion, yield and waste without changing sales price',()=>{const r=calculateRecipeCost({lines:[{item_id:'a',quantity:250,unit:'g'}],items:[{id:'a',base_unit:'kg'}],costs:[{item_id:'a',cost_per_base_unit:80}],yieldUnits:2,wastePercent:20,price:50});assert.equal(r.complete,true);assert.equal(r.unitCost,12.5);assert.equal(r.margin,37.5);});
test('recipe versions and consumption plans never infer incomplete recipes',()=>{assert.throws(()=>validateRecipeVersion({product_id:'p',name:'x',lines:[]}),/ingrediente/);const rows=planSaleConsumption({saleId:'sale',branchId:'mora',items:[{product_id:'p',quantity:2}],recipes:[{id:'r',product_id:'p',status:'active',complete:true,lines:[{item_id:'i',quantity:.15}]}]});assert.deepEqual(rows,[{sale_id:'sale',branch_id:'mora',recipe_version_id:'r',item_id:'i',quantity:.3}]);});
test('recipe migration preserves version history and keeps sale integration disabled',()=>{for(const part of ['pw_inventory_item_costs','pw_recipe_versions','pw_recipe_lines','pw_sale_recipe_consumptions','ENABLE ROW LEVEL SECURITY','request_id','not wired into pw_register_sale_v2'])assert.ok(sql.includes(part),part);});

test('empty recipe and null ingredient price cannot be mistaken for zero-cost recipes',()=>{
 assert.equal(calculateRecipeCost({lines:[],items:[],costs:[],price:130}).complete,false);
 const cost=calculateRecipeCost({lines:[{item_id:'a',quantity:1,unit:'pieza'}],items:[{id:'a',base_unit:'pieza'}],costs:[{item_id:'a',cost_per_base_unit:null}],price:130});
 assert.equal(cost.complete,false);assert.equal(cost.margin,null);
});

test('overview preserves active and draft states, including Boneless 75 g and Alitas one portion',()=>{
 const snapshot={products:[{id:'bon',name:'Boneless',unit:'porción',sale_price:130},{id:'ali',name:'Alitas',unit:'porción',sale_price:120},{id:'sin',name:'Sin receta',unit:'pieza',sale_price:80}],versions:[{id:'bon-v1',product_id:'bon',name:'Boneless preparada',version_no:1,yield_units:1,waste_percent:0,status:'active'},{id:'ali-v1',product_id:'ali',name:'Alitas preparada',version_no:1,yield_units:1,waste_percent:0,status:'draft'}],lines:[{recipe_version_id:'bon-v1',item_id:'bon-item',quantity:75,unit:'g'},{recipe_version_id:'ali-v1',item_id:'ali-item',quantity:1,unit:'porción'}],items:[{id:'bon-item',name:'Boneless preparado',base_unit:'g',item_type:'finished_good'},{id:'ali-item',name:'Alitas preparadas',base_unit:'porción',item_type:'finished_good'}],costs:[]};
 const overview=buildRecipeOverview(snapshot),bon=overview.rows.find(row=>row.product.id==='bon'),ali=overview.rows.find(row=>row.product.id==='ali');
 assert.equal(overview.summary.active,1);assert.equal(overview.summary.draft,1);assert.equal(overview.summary.withoutRecipe,1);
 assert.equal(bon.recipe.status,'active');assert.equal(bon.lines[0].quantity,75);assert.equal(bon.lines[0].unit,'g');
 assert.equal(ali.recipe.status,'draft');assert.equal(ali.lines[0].quantity,1);assert.equal(ali.lines[0].unit,'porción');
 assert.equal(overview.summary.pendingCosts,3);
});

test('overview calculates backed costs and never promotes a draft recipe',()=>{
 const overview=buildRecipeOverview({products:[{id:'p',name:'Producto',unit:'pieza',sale_price:100}],versions:[{id:'old',product_id:'p',name:'Antigua',version_no:1,yield_units:1,waste_percent:0,status:'active'},{id:'new',product_id:'p',name:'Nueva',version_no:2,yield_units:1,waste_percent:0,status:'draft'}],lines:[{recipe_version_id:'old',item_id:'i',quantity:250,unit:'g'},{recipe_version_id:'new',item_id:'i',quantity:1,unit:'kg'}],items:[{id:'i',name:'Insumo',base_unit:'kg'}],costs:[{item_id:'i',cost_per_base_unit:80}]});
 assert.equal(overview.rows[0].recipe.id,'old');assert.equal(overview.rows[0].cost.unitCost,20);assert.equal(overview.rows[0].cost.margin,80);assert.equal(overview.summary.completeCosts,1);
});

test('read-only loader queries the recipe tables and tolerates denied cost access',async()=>{
 const calls=[],rows={pw_products:[{id:'p'}],pw_recipe_versions:[],pw_recipe_lines:[],pw_inventory_items:[]};
 const result=table=>Promise.resolve(table==='pw_inventory_item_costs'?{data:null,error:{message:'permission denied'}}:{data:rows[table]||[],error:null});
 const client={from(table){calls.push(table);return {select(){return {eq(){return {order(){return result(table)}}},order(){const chain={order(){return result(table)},then(resolve,reject){return result(table).then(resolve,reject)}};return chain}}}}}};
 const snapshot=await loadRecipeCosts(client);
 assert.deepEqual(calls,['pw_products','pw_recipe_versions','pw_recipe_lines','pw_inventory_items','pw_inventory_item_costs']);
 assert.equal(snapshot.costAccess,'unavailable');assert.equal(snapshot.costs.length,0);
});
