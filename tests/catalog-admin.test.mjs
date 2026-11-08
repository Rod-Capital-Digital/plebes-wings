import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Harness independiente: interpreta las funciones reales de app.js; no altera
// el código de producción ni hace llamadas a Supabase.
const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '')
  .split("document.addEventListener('click'")[0];

function createHarness({ unauthorized=false, writeError=null, noRow=false, delay=0, reloadError=null }={}) {
  const records = [
    {id:'p1', name:'Alitas 6', unit:'porción', sale_price:99, detail:'Seis piezas', active:true, updated_at:'2026-01-01'},
    {id:'p2', name:'Boneless', unit:'porción', sale_price:129, detail:'', active:false, updated_at:'2026-01-01'}
  ];
  const calls = [], toasts = [];
  let reloaded = 0, rendered = 0, nextId = 3;
  const form = {
    dataset: {},
    fields: new Map(),
    listeners: {},
    error: { hidden:true, textContent:'' },
    button: { disabled:false, textContent:'Guardar producto', dataset:{} },
    querySelector(selector) {
      if (selector === '#modal-error') return this.error;
      if (selector === '[type="submit"]') return this.button;
      throw Error('Selector de formulario no simulado: '+selector);
    },
    addEventListener(name, fn) { this.listeners[name] = fn; },
    submit() {
      assert.equal(typeof this.listeners.submit, 'function', 'El formulario debe registrar submit');
      return this.listeners.submit({ preventDefault() {} });
    },
  };
  const dialog = {
    open: false, closed: 0,
    close() { this.closed++; this.open=false; },
    showModal() { this.open=true; }
  };
  const panel = {
    html: '',
    set innerHTML(value) { this.html = value; },
    get innerHTML() { return this.html; },
    querySelector(selector) {
      if (selector==='#modal-form') return form;
      throw Error('Selector de panel no simulado: '+selector);
    },
    querySelectorAll() { return []; },
  };
  const elements = new Map([['dialog',dialog], ['dialog-content', panel]]);
  const document = {
    getElementById(id) { return elements.get(id) ?? { hidden:false, textContent:'' }; },
    querySelectorAll() { return []; },
    createElement() { return { remove(){}, className:'', textContent:'' }; },
  };
  const ctx = vm.createContext({
    console: {error(){},warn(){},log(){}},
    structuredClone, Date, Math, setTimeout, clearTimeout,
    document, location:{hash:'#ajustes'}, history:{replaceState(){}},
    localStorage:{getItem:()=>null},
    FormData: class { constructor(formElement) { this.fields=formElement.fields; } get(key) { return this.fields.get(key)??null; } },
    getSupabaseClient(){}, getSupabaseConfigurationStatus(){return {configured:false}},
    previewLegacyImport(){}, localExport(){}, LOCAL_KEY:'test',
  });
  vm.runInContext(source + `\nrender=()=>{globalThis.__rendered()}; toast=(message,type)=>{globalThis.__toast(message,type)}; globalThis.api={authState,data,clickAction,editProduct,saveProductToSupabase,refreshCatalog,renderSettings,validMember,hydrateReadOnlyCatalog,save,modal};`, ctx);
  ctx.__rendered = () => { rendered++; };
  ctx.__toast = (message,type) => { toasts.push({ message, type:type??'success' }); };
  const {api} = ctx;
  api.authState.status = 'authenticated';
  api.authState.user = {id:'u1'};
  api.authState.member = {user_id:'u1', active:!unauthorized, role:'owner', branch_id:null};
  api.hydrateReadOnlyCatalog([{id:'b1',name:'Sucursal',location_description:'Ubicación',active:true}], records);

  const response = async (op,payload,id) => {
    if (delay) await new Promise(resolve=>setTimeout(resolve,delay));
    if (writeError) return {data:null,error:writeError};
    if (noRow) return {data:null,error:null};
    if (op==='insert') {
      const row={...payload, id:'p'+nextId++};
      records.push(row);
      return {data:{...row},error:null};
    }
    const row=records.find(item=>item.id===id);
    if (!row) return {data:null,error:null};
    Object.assign(row,payload);
    return {data:{...row},error:null};
  };
  api.authState.client = {
    from(table){
      assert.equal(table,'pw_products','El catálogo solo debe consultar y escribir pw_products');
      return {
        select(){return {
          order:async()=>{
            reloaded++;
            if(reloadError)return {data:null,error:reloadError};
            return {data:records.map(x=>({...x})),error:null};
          }
        }},
        insert(payload){
          calls.push({op:'insert',payload:{...payload}});
          return {select(){return {single:()=>response('insert',payload,null)}}};
        },
        update(payload){
          return {eq(column,id){
            assert.equal(column,'id');
            calls.push({op:'update',payload:{...payload},id});
            return {select(){return {maybeSingle:()=>response('update',payload,id)}}};
          }};
        },
      };
    },
  };
  const setFields=(values)=>{form.fields=new Map(Object.entries(values));};
  return {
    api,records,calls,toasts,form,dialog,panel,setFields,
    get reloaded(){return reloaded},
    get rendered(){return rendered},
    click(action,id){api.clickAction({dataset:{action,id}})},
  };
}

const active = {name:'Alitas 10',unit:'porción',price:'150',detail:'Diez piezas',active:'on'};

// 1. Botones HTML y apertura real del modal (sin reemplazar modal()).
test('Editar y Añadir presentación: botones habilitados y modal con precio actual',()=>{
  const h=createHarness();
  const html=h.api.renderSettings();
  assert.match(html,/data-action="product-new"/);
  assert.match(html,/data-action="product-edit" data-id="p1"/);
  assert.doesNotMatch(html,/Editar · pendiente|Añadir presentación · pendiente/);
  assert.match(html,/Inactivo/);
  h.click('product-edit','p1');
  assert.equal(h.dialog.open,true);
  assert.match(h.panel.html,/Editar producto/);
  assert.match(h.panel.html,/name="price"[^>]*value="99"/);
  h.click('product-new');
  assert.match(h.panel.html,/Añadir presentación/);
});

test('Crear: insert confirmado, recarga del catálogo, sin ID local ni persistencia falsa',async()=>{
  const h=createHarness();h.click('product-new');h.setFields(active);
  await h.form.submit();
  assert.equal(h.calls.length,1);
  assert.equal(h.calls[0].op,'insert');
  assert.equal(h.calls[0].payload.sale_price,150);
  assert.equal(Object.hasOwn(h.calls[0].payload,'id'),false);
  assert.equal(h.records.length,3);
  assert.equal(h.api.data.products.find(p=>p.id==='p3').price,150);
  assert.equal(h.reloaded,1);
  assert.equal(h.dialog.open,false);
  assert.equal(h.rendered,1);
  assert.equal(h.toasts.filter(t=>t.type!=='error').length,1);
});

test('Editar: update por ID exacto, conserva los demás productos y recarga precio',async()=>{
  const h=createHarness();h.click('product-edit','p1');
  h.setFields({...active,name:'Alitas 6',price:'120'});
  await h.form.submit();
  assert.equal(h.calls.length,1);
  assert.equal(h.calls[0].op,'update');
  assert.equal(h.calls[0].id,'p1');
  assert.equal(h.api.data.products.find(p=>p.id==='p1').price,120);
  assert.equal(h.api.data.products.find(p=>p.id==='p2').price,129);
  assert.equal(h.reloaded,1);
});

test('Error y respuesta sin filas mantienen abierto el formulario y no reportan éxito',async()=>{
  for(const options of [{writeError:{message:'Red sin conexión'}},{noRow:true}]){
    const h=createHarness(options);h.click('product-edit','p1');h.setFields({...active,price:'200'});
    await h.form.submit();
    assert.equal(h.dialog.open,true);
    assert.equal(h.dialog.closed,0);
    assert.equal(h.api.data.products.find(p=>p.id==='p1').price,99);
    assert.equal(h.form.button.disabled,false);
    assert.equal(h.form.error.hidden,false);
    assert.equal(h.toasts.some(t=>t.type!=='error'),false);
    assert.equal(h.reloaded,0);
  }
});

test('Doble envío no duplica inserciones y restablece el botón',async()=>{
  const h=createHarness({delay:25});h.click('product-new');h.setFields(active);
  const one=h.form.submit();const two=h.form.submit();
  await Promise.all([one,two]);
  assert.equal(h.calls.length,1);
  assert.equal(h.records.length,3);
  assert.equal(h.dialog.closed,1);
  assert.equal(h.form.button.disabled,false);
  assert.equal(h.form.dataset.saving,'false');
});

test('Membresía inactiva y ausencia de conexión impiden la edición',async()=>{
  const h=createHarness({unauthorized:true});
  assert.throws(()=>h.click('product-edit','p1'),/Acceso denegado/);
  assert.throws(()=>h.click('product-new'),/Acceso denegado/);
  assert.equal(h.calls.length,0);
  assert.doesNotMatch(h.api.renderSettings(),/data-action="product-new"/);
  const other=createHarness();other.api.authState.client=null;
  other.click('product-edit','p1');
  assert.equal(other.dialog.open,false);
  assert.equal(other.calls.length,0);
});

test('Guardado de otros módulos suspendido y recarga fallida no indica éxito',async()=>{
  const h=createHarness({reloadError:{message:'No se pudo consultar'}});
  assert.throws(()=>h.api.save(),/Captura suspendida/);
  h.click('product-new');h.setFields(active);
  await h.form.submit();
  assert.equal(h.records.length,3,'La escritura puede quedar confirmada incluso si falla la recarga');
  assert.equal(h.dialog.open,true);
  assert.match(h.form.error.textContent,/confirmó el guardado, pero falló la recarga/);
  assert.equal(h.toasts.some(t=>t.type!=='error'),false);
});
