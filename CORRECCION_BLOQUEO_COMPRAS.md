# Plebes Wings V2 · Corrección de Compras centralizadas

## Problema diagnosticado

La V2 preguntaba a `pw_create_purchase_draft_v1` con `{p_request:{}}` para confirmar que la RPC estaba instalada sin crear registros. La RPC en Supabase responde correctamente «Identificador de solicitud inválido.», pero la expresión regular del navegador solo reconocía «Solicitud de compra inválida.». La verificación descartaba una respuesta válida y bloqueaba el botón de compra.

## Cambios

- Se admite la respuesta exacta de validación del servidor (y el texto alternativo anterior).
- Los errores de permisos, autenticación, ausencia de RPC y otros problemas siguen bloqueando la captura.
- No se ejecutaron inserciones, anulaciones ni transacciones reales de compra en Supabase.
- Si aún faltan proveedores o insumos, se muestra una instrucción concreta y el botón de compra permanece deshabilitado hasta configurar ambos catálogos.
- El contador de proveedores muestra la cantidad real de proveedores activos del catálogo, no solo los usados en compras.
- Las pestañas Entregas y Mermas indican dónde registrar los movimientos en Inventario y mermas.
- Se agregaron pruebas de regresión del mensaje exacto de producción y de errores de acceso.

## Instalar sin tocar Supabase

1. Guarda la carpeta de la V2 actual como respaldo.
2. Extrae el ZIP de esta entrega y abre `Plebes_Wings_Portal_V2_CORREGIDA` en VS Code.
3. Inicia un servidor local desde **esa** carpeta: `py -m http.server 5500`.
4. Abre `http://localhost:5500/#abasto`, inicia sesión y selecciona **Compras centralizadas**.
5. Fuerza recarga en Chrome con Ctrl+Shift+R si el navegador conserva el JavaScript anterior.
6. Verifica que aparezca «Conectado a Supabase» y las opciones Nuevo proveedor y Nuevo insumo. El botón «Registrar compra» se habilita cuando existan al menos un proveedor e insumo activos.

## Pendientes

No se cargaron proveedores, insumos, precios, gramajes ni inventarios iniciales. No se validó una compra real ni su recepción; esas pruebas deben realizarse con operaciones autorizadas. La verificación positiva de la RPC no sustituye una validación transaccional end-to-end.
