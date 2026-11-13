# Plebes Wings V2 — Validación y puesta en operación controlada

**Fecha:** 12 de noviembre de 2026
**Alcance:** revisión de las migraciones 14–17 sobre la base previamente instalada hasta la 12.
**Entorno de esta revisión:** copia extraída del ZIP entregado; **sin acceso a la carpeta Git del equipo**, **sin PostgreSQL/psql/Docker local**; Supabase producción fue consultado **solamente para metadatos** (migraciones, tablas y recuento de roles). Ningún SQL de escritura se ejecutó en producción.

> **DECISIÓN:** NO APTO AÚN PARA DESPLEGAR 14–17 A PRODUCCIÓN. Son indispensables una copia aislada de la base, pruebas SQL de seguridad/concurrencia y autorización del propietario.

## Hallazgos confirmados

| Área | Resultado | Evidencia / límite |
| --- | --- | --- |
| JS: suite completa | 122/122 pasan | `node --test tests/*.test.mjs` en Node 22.16.0; sin E2E contra PostgreSQL |
| Sintaxis JS | Sin errores | `node --check` de módulos de raíz |
| Estado productivo | Migraciones registradas hasta 12 | Consulta read-only a Supabase project `rilrfcmmylldftioapnc`; **14–17 no registradas** |
| Datos productivos operativos | 0 ventas, 0 compras modernas, 0 movimientos y 0 insumos | Recuento de tablas; no se inspeccionaron datos personales |
| Propietario (`owner`) activo | **Ninguno** | Agrupación de `pw_members` read-only: 1 `consultant`, 1 `employee` activos |
| Prueba transaccional 14–17 | NO EJECUTADA | No hay instancia PostgreSQL local ni clon autorizado |
| Prueba JWT/RLS | NO EJECUTADA | Scripts preparados para base aislada, sin resultado todavía |
| Prueba de concurrencia en 2 sesiones | NO EJECUTADA | Requiere PostgreSQL aislado, dos conexiones y fixtures |
| Recetas y descuentos por venta | No activados | 16 crea catálogo/preparación; no enlaza `pw_register_sale_v2` con inventario |
| Visual/UI en Android y caja con datos reales | NO EJECUTADA | Se requiere dispositivo o navegador y datos de prueba aislados |

## Dependencias técnicas y cambios del paquete

### Migración 14 — Transferencia directa antigua

Extiende el ledger (tipos `transfer` y `reversal`, campos de responsable, idempotencia y reversión), introduce `pw_prepare_branch_delivery_v1` y `pw_reverse_branch_delivery_v1`. Su transferencia es **inmediata** (central → sucursal), no representa despachos pendientes. El script aislado existente tenía un caso de “saldo insuficiente” que usaba **1 kg teniendo 5 kg**, y una comprobación errónea de inexistencia de fila tras dejar balance cero: corregidos ambos en `sql/tests/14_BRANCH_DELIVERIES_ISOLATED.sql`.

### Migración 15 — Entregas pendientes e `in_transit`

Añade borradores, despacho, recepción parcial, historia y RLS. Se reforzó:

1. Trigger `private.pw_guard_transit_inventory_v1`: los movimientos con `location_id='in_transit'` sólo son aceptados si la transacción tiene tipo `transfer` y procedencia interna identificada `dispatch:<hash>` o `receipt:<hash>`; las RPC antiguas de ajustes/traspasos no crean esos movimientos. Este es un control sobre **escrituras de roles de aplicación**, no impide que un administrador de base altere datos por SQL privilegiado.
2. Comprobación explícita de saldo en tránsito bajo bloqueo de artículo antes de insertar una recepción.
3. Revocación del acceso `authenticated` a las dos RPC **directas de 14**, que no modelan entrega pendiente. La RPC histórica de traspaso de 12 sigue disponible para entregas físicas inmediatas entre ubicaciones normales, pero no puede tocar `in_transit` por el trigger.
4. Script reversible de despacho, recepción parcial, rechazo por otra sucursal, replay e integridad de balances.

**Pendiente importante:** hace falta política operativa para diferencias definitivas, pérdidas durante el transporte o devolución de mercancía en tránsito; no se automatiza un ajuste que no tenga destino físico confirmado.

### Migración 16 — Recetas y costos

Añade tablas de costos, versiones de recetas, líneas y consumo histórico. Se agregó el índice que evita más de **una receta activa por producto**. Conserva RLS y niega escritura directa a usuarios de aplicación. **No crea edición persistente de recetas ni consumo automático por venta**; estos pasos exigen una RPC nueva con pruebas de venta e inventario en una sola transacción. La prueba 16 valida estructura/RLS/restricciones, no los consumos de ventas.

### Migración 17 — Compras y recepción parcial

Reemplaza el evento de recepción completa de migración 09: deshabilita el trigger que antes abonaba **todas las líneas ordenadas** y registra sólo cantidades **realmente recibidas** mediante `pw_receive_purchase_partial_v1`. Preserva compatibilidad de la RPC completa antigua mediante delegación. El bloqueo de la compra `FOR UPDATE`, claves únicas y hash previenen recepciones concurrentes o reintentos duplicados. `purchases-integration.js` ahora excluye la cuenta `in_transit` como destino normal de compras y exige ingresar explícitamente el costo unitario, sin convertir el campo vacío a $0.

**Pendiente de puesta en operación:** si aparecen compras históricas `received` antes del despliegue de 17, la tabla nueva de recibos no reflejará esos documentos automáticamente aunque los movimientos anteriores sigan en ledger. Antes del despliegue hay que volver a consultar y reconciliar ese conteo. Al momento de la revisión había **0 documentos de compra**.

## Pruebas aisladas preparadas (NO ejecutadas)

- `sql/tests/PRECHECK_ISOLATED_BASE.sql`: exige esquema, sucursales y RPC de 09 presentes.
- `sql/tests/14_BRANCH_DELIVERIES_ISOLATED.sql`: flujo histórico inmediato; ejecutar **después de 14 y antes de 15**, porque la 15 revoca sus RPC de aplicación.
- `sql/tests/15_BRANCH_DELIVERIES_ISOLATED.sql`: prueba de entrega pendiente, tránsito, recepción parcial, bloqueo de traspaso antiguo, replay y permisos entre sucursales.
- `sql/tests/16_RECIPES_SCHEMA_ISOLATED.sql`: validación RLS y restricciones de estructura, sin consumo real.
- `sql/tests/17_PARTIAL_PURCHASE_RECEIPTS_ISOLATED.sql`: recepción 4 + 6, doble reintento, acceso indebido y compatibilidad de recepción completa.
- `tools/test-sql-local.ps1`: ejecutor **únicamente para 127.0.0.1/localhost**; se detiene con cualquier error, no admite host remoto.

### Cómo preparar una base aislada (Windows)

1. Instalar Docker Desktop (o runtime compatible) y la Supabase CLI. Consultar las instrucciones vigentes de `https://supabase.com/docs/guides/local-development` y verificar `supabase --help` para la versión instalada.
2. Configurar una instancia local de Supabase, sin enlazar sus operaciones de prueba a la base de producción. **No basta con iniciar una base vacía**: hay que importar el esquema base realmente compatible (`auth`, `private`, tablas de Plebes Wings y migraciones hasta la 12), incluyendo únicamente los catálogos inocuos necesarios de las sucursales `mora`, `santacruz` y `central`. Utilizar un esquema exportado de manera autorizada, sin datos personales ni claves, y verificar los objetos con `PRECHECK_ISOLATED_BASE.sql`.
3. Confirmar que no existan **aún** 14–17 en esa instancia local. Si existen, restaurar/recrear el clon antes de ejecutar el flujo.
4. Con `psql` en PATH, establecer una URL **exclusivamente local** (adaptar puerto):

```powershell
$env:PLEBES_LOCAL_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
.\tools\test-sql-local.ps1
```

Este script aplica migraciones al **clon local** y ejecuta scripts de prueba transaccionales `BEGIN ... ROLLBACK`. **Las migraciones sí persisten en el clon** y requieren restaurarlo antes de repetir la suite de instalación. Nunca copie la URL, contraseña o un `pg_dump` completo a GitHub.

### Pruebas de concurrencia adicionales (dos sesiones, mismo clon)

La batería SQL incluida prueba secuencias y reintentos seriales, **no concurrencia física**. Antes de producción se debe realizar, en dos conexiones `psql` con el mismo fixture, la siguiente matriz:

| Caso simultáneo | Resultado obligatorio |
| --- | --- |
| Mismo `request_id` de despacho y misma carga | 1 movimiento, segundo resultado `replayed=true` |
| `request_id` repetido con otra carga | Rechazo sin cambios de balance |
| Dos despachos diferentes por stock central insuficiente | Una operación falla, existencias nunca negativas |
| Dos recepciones de una misma línea (suma mayor que despachado) | Se serializan y se rechaza el excedente |
| Dos recepciones de compra de una misma línea (suma mayor que comprada) | Sólo se contabiliza el máximo comprado |
| Dos cierres/anulaciones con la misma solicitud | Se conserva unicidad y auditoría |

Guardar el registro de resultados, consultas de balances y bloqueo de filas; no declarar la concurrencia aprobada sin ejecutar efectivamente dos sesiones.

## Checklist antes de habilitar producción

- [ ] Validar restauración de **respaldo reciente** en ambiente separado y documentar punto de recuperación. Confirmar el método de respaldo disponible en el plan Supabase, sin asumir PITR.
- [ ] Establecer una ventana de mantenimiento y congelar escrituras de inventario/compras durante el despliegue.
- [ ] Confirmar que `pw_members` incluya un `owner` genuino activo, incorporado mediante proceso autorizado, sin elevar automáticamente al consultor.
- [ ] Confirmar migraciones previas 03–12, dependencias, extensión de UUID, funciones `private.pw_is_manager`/`private.pw_can_read_branch`, RLS y `auth`.
- [ ] Revisar préstamos/transacciones de compras `received` históricas y el ledger vigente.
- [ ] Ejecutar los cinco scripts aislados y documentar **cero fallos**, además de concurrencia de dos conexiones y pruebas JWT owner/consultant/employee.
- [ ] Obtener aprobación explícita para cada migración. Ejecutar 14 → 15 → 16 → 17 **en ese orden**, monitorizar errores y revalidar funciones.
- [ ] Verificar el balance `SUM(quantity)` por ubicación/insumo; `in_transit` no debe ser negativo; no debe duplicarse inventario en recepción.
- [ ] Validar inicio de sesión, permisos por sucursal y compras/entregas de extremo a extremo con usuarios reales y datos previamente autorizados.
- [ ] Capturar conteos físicos iniciales y recetas/costos reales. **No activar consumo automático de venta** hasta implementar y probar esa RPC transaccional separada.
- [ ] Repetir suite Node, navegación, pruebas Android y confirmar que venta / caja no sufran regresiones.
- [ ] Separar reimpresiones, ventas confirmadas y comandas borrador; verificar conciliación de reintentos inciertos.
- [ ] Guardar acta de despliegue, evidencia de aprobación y mediciones de producción posteriores.

## Recuperación ante fallo

1. **Antes:** respaldo verificado + plan de restauración + inventario/ventas reconciliados y ventana de cambio.
2. **Fallo dentro de una migración** (`BEGIN`/`COMMIT`): PostgreSQL revierte esa migración, pero **no** las anteriores ya confirmadas. Detener secuencia y diagnóstico; no reejecutar a ciegas.
3. **Fallo posterior a varias migraciones confirmadas:** no intentar `DROP TABLE`, borrar movimientos ni reescribir ventas como “rollback”. Evaluar una **migración compensatoria** revisada o restauración completa a un punto verificado, considerando cualquier operación posterior que se perdería.
4. **Dato contable incorrecto:** mantener ledger inmutable; utilizar una rectificación autorizada, auditada e idempotente. Nunca modificar balances directamente.
5. **Sin respaldo restaurable o sin dueño activo:** detener la puesta en operación.

## Fuera de alcance deliberadamente

- Activación de descuento automático por venta/receta; todavía no existe una RPC de consumo coordinada.
- Conciliación final de mermas o faltantes en tránsito sin recibo físico.
- Impresión Bluetooth y agente de IA.
- Certificación de cierre de caja con terminales, pagos reales e impuestos.

**Criterio de aceptación:** hasta que todas las casillas de respaldo, SQL aislado, concurrencia, RLS y roles estén verificadas, el resultado se clasifica como **preparado para pruebas en staging**, no “listo para producción”.
