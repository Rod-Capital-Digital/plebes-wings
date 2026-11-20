# Plebes Wings — Activación segura del inventario por producto terminado

**Estado:** documento auditado, pendiente de pruebas en staging. **No desplegado.**

## Alcance

- Mantener intacta la receta activa de Boneless (75 g por venta).
- Reutilizar los artículos y la receta en borrador ya existentes para Alitas.
- Preparar 16 productos adicionales y sus recetas de una unidad terminada por venta (17 con Alitas).
- No crear inventarios iniciales ni modificar ventas, pagos, compras o entregas existentes.
- Conservar separación central / en tránsito / La Mora / Santa Cruz.
- No confundir control comercial por porciones con consumo de ingredientes, merma o costo real por receta.

## BLOQUEO DE DESPLIEGUE: versiones antiguas de la RPC de ventas

La función `public.pw_register_sale_v2` actualmente acepta llamadas del rol `authenticated` y guarda ventas/pagos sin registrar consumo de inventario. La función `v3` sí invoca el registro de consumo. Por tanto:

1. Auditar el portal (producción, versiones locales o publicadas, integraciones móviles y pruebas) para comprobar que **todas** las ventas usan únicamente `public.pw_register_sale_v3`.
2. Ajustar cualquier cliente que use `v1` o `v2`, y probar venta normal, insuficiencia de existencias y reintento idempotente.
3. Solo entonces aplicar el bloque de `REVOKE` de la migración auditada sobre `pw_register_sale_v1` y `pw_register_sale_v2`. Las llamadas internas de `v3` pueden seguir ejecutando `v2` bajo el propietario de la función; corroborarlo en staging.
4. Comprobar como `authenticated` que `v1`/`v2` ya no son ejecutables y que `v3` sí funciona.
5. No desplegar la migración auditada si aún existen clientes dependientes de las RPC antiguas.

## Prevuelo y staging

1. Tener respaldo restaurable y lista de versiones/aplicaciones desplegadas. No usar producción como entorno de ensayo para una migración DDL.
2. Verificar correspondencia entre las migraciones previas y la base actual (07, 09, 15, 16, 17, 22, 24), además de confirmar que existen `pw_produce_inventory_v1`, `pw_register_sale_v3` y `private.pw_post_sale_recipe_inventory_v1`.
3. Crear o usar staging **solo previa autorización de los costos** aplicables. No hay actualmente ramas de desarrollo de Supabase disponibles en el proyecto.
4. En staging, aplicar `25_FINISHED_GOODS_PORTION_CONTROL_AUDITADA_PENDIENTE_STAGING.sql` y comprobar ausencia de conflictos por SKU/`product_id`; el bloque final abortará si hay productos activos sin configuración coherente de **una sola línea** de receta que consume una unidad terminada.
5. Comparar conteos e importes de `pw_sales`, `pw_sale_lines`, `pw_sale_payments`, `pw_inventory_movements`, `pw_inventory_transactions`, `pw_branch_deliveries` y `pw_purchases` antes/después. Ninguno debe cambiar por el mero despliegue.
6. Verificar que Boneless conserva exactamente su receta activa y que las 17 nuevas quedan inactivas (`draft`) salvo una que ya se hubiera aprobado explícitamente en otra fase.
7. Probar cantidades `1`, `0`, `1.5` y `-1` en operaciones pertinentes: unidades discretas no deben admitir fracciones ni importes inválidos; las medidas `g` y `ml` conservan su precisión normal.
8. Probar compra y recepción, producción, transferencia, despacho y recepción parcial con los usuarios `consultant`, Santa Cruz y La Mora, incluyendo acceso cruzado y reintentos con el mismo `request_id`.
9. Probar reintento de una venta histórica con el mismo `request_id` **después** de activar una receta en staging: jamás debe generar consumo retroactivo.

## Activación por producto (global, NO por sucursal)

Las recetas `pw_recipe_versions.status='active'` afectan **ambas sucursales**. Para cada producto:

1. Registrar y conciliar existencias **reales** en Santa Cruz y La Mora antes de activar una receta. Si una sucursal no lo vende, definir y comprobar una regla formal que impida venderlo allí; no basta con tener 0 existencias.
2. Producir solo sobre porciones de entrada respaldadas por adquisiciones/operaciones reales. La función actual transforma un tipo de entrada en un tipo terminado con la misma unidad base; no constituye una receta de ingredientes ni convierte automáticamente kg a porciones.
3. Despachar y recibir el producto terminado con flujo auditado, cotejando cantidades físicas.
4. Activar una receta **global** cuando ambas sucursales estén preparadas, una receta a la vez (iniciar por Alitas).
5. Verificar venta de 1 unidad en Santa Cruz y de 1 unidad en La Mora, descontando exactamente una unidad en cada saldo propio.
6. Verificar venta de última unidad, stock cero, saldo insuficiente y que el intento rechazado no genere ticket, pago ni movimiento.
7. Documentar resultados, saldo inicial/final y responsable antes de activar el siguiente producto.

**No seguir la secuencia antigua “activar primero Santa Cruz y luego La Mora”**: la activación por sucursal no existe en el esquema actual. Si se requiere, diseñar una habilitación explícita por producto/sucursal, con RLS y validación en la RPC, probarla antes de usarla.

## Productos con consideraciones particulares

- **Refresco:** comprar como artículo terminado `unidad`, recibir y distribuir sin producción artificial.
- **Papas de distintos tamaños:** los artículos terminados son independientes; una porción chica no equivale automáticamente a una grande.
- **Jarra de agua refill:** una venta descuenta una **jarra comercial**, pero no registra el volumen real consumido en recargas ilimitadas. Validar el modelo comercial antes de activar; si se requiere control de líquidos, habrá que contabilizar volumen y reposiciones por separado.
- **Bebidas en vaso:** la unidad final `vaso` no mide el rendimiento real en litros, hielo, vasos o concentrado.

## Reversión controlada

- Nunca borrar movimientos o ventas para “deshacer” una activación.
- Si aparece una inconsistencia, suspender la operación afectada, conciliar saldos y tickets, y decidir si corresponde desactivar la receta mediante procedimiento auditado.
- No reabrir `v1`/`v2` a `authenticated` solo para solucionar errores de una aplicación antigua: se reintroduciría la posibilidad de vender sin consumo automático.
- Documentar cada cambio y mantener una copia versionada en Git.
