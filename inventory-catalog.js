export const INVENTORY_UNITS=Object.freeze(['kg','g','l','ml','pieza']);
export const INVENTORY_ITEM_TYPES=Object.freeze(['raw_material','packaging','consumable','semi_finished','finished_good']);

// Templates only: none of these records are inserted until an administrator confirms the form.
export const INVENTORY_ITEM_TEMPLATES=Object.freeze([
 {id:'pollo',name:'Pollo',item_type:'raw_material',base_unit:'kg'},
 {id:'sirloin',name:'Carne de sirloin',item_type:'raw_material',base_unit:'kg'},
 {id:'arrachera',name:'Arrachera',item_type:'raw_material',base_unit:'kg'},
 {id:'papas',name:'Papas',item_type:'raw_material',base_unit:'kg'},
 {id:'pan',name:'Pan',item_type:'raw_material',base_unit:'pieza'},
 {id:'queso',name:'Queso',item_type:'raw_material',base_unit:'kg'},
 {id:'verduras',name:'Verduras',item_type:'raw_material',base_unit:'kg'},
 {id:'salsas',name:'Salsas',item_type:'raw_material',base_unit:'l'},
 {id:'aceite',name:'Aceite',item_type:'consumable',base_unit:'l'},
 {id:'empaques',name:'Empaques',item_type:'packaging',base_unit:'pieza'},
 {id:'bebidas',name:'Bebidas',item_type:'finished_good',base_unit:'pieza'}
]);

export function validateInventoryItem(payload){
 const name=String(payload?.name||'').trim();
 const item_type=String(payload?.item_type||'').trim();
 const base_unit=String(payload?.base_unit||'').trim();
 const sku=String(payload?.sku||'').trim();
 if(name.length<2||name.length>160)throw Error('El nombre del insumo debe tener entre 2 y 160 caracteres.');
 if(!INVENTORY_ITEM_TYPES.includes(item_type))throw Error('Tipo de insumo no permitido.');
 if(!INVENTORY_UNITS.includes(base_unit))throw Error('Unidad base no permitida. Usa kg, g, l, ml o pieza.');
 if(sku.length>80)throw Error('El SKU no puede exceder 80 caracteres.');
 return {name,item_type,base_unit,sku:sku||null};
}
