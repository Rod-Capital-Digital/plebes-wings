import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {convertToBase,calculateRecipeCost,validateRecipeVersion,planSaleConsumption} from '../recipes-integration.js';
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
