import test from 'node:test';
import assert from 'node:assert/strict';
import {INVENTORY_ITEM_TEMPLATES,validateInventoryItem} from '../inventory-catalog.js';

test('plantillas de insumo no contienen costo ni existencia y usan una unidad base permitida',()=>{
 assert.deepEqual(INVENTORY_ITEM_TEMPLATES.map(item=>item.id),['pollo','sirloin','arrachera','papas','pan','queso','verduras','salsas','aceite','empaques','bebidas']);
 for(const item of INVENTORY_ITEM_TEMPLATES){assert.equal('cost' in item,false);assert.equal('quantity' in item,false);assert.doesNotThrow(()=>validateInventoryItem(item));}
});

test('catálogo rechaza unidades mezcladas o no soportadas',()=>{
 assert.throws(()=>validateInventoryItem({name:'Pollo',item_type:'raw_material',base_unit:'litro'}),/Unidad base/);
 assert.throws(()=>validateInventoryItem({name:'Aceite',item_type:'raw_material',base_unit:'kg/l'}),/Unidad base/);
});
