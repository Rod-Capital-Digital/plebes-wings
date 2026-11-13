# Inventario y entregas: preparación segura

## Estado de esta entrega

- Producción conserva solamente las migraciones 07–12. No se aplicó SQL ni se crearon artículos, saldos o movimientos.
- La migración `14_BRANCH_DELIVERIES_REVIEW.sql` sigue siendo **de revisión**. Implementa una entrega de varias partidas desde `central`, con solicitud idempotente, bloqueos por artículo/ubicación, validación del saldo total antes de insertar y dos movimientos opuestos por partida.
- La migración 14 incluye `pw_reverse_branch_delivery_v1`. No actualiza ni borra movimientos: crea un nuevo asiento inverso, exige motivo, impide una segunda reversión y escribe la bitácora `branch_delivery_reversed`.
- Las escrituras directas a `pw_inventory_transactions` y `pw_inventory_movements` permanecen revocadas para `anon` y `authenticated`.

## Auditoría de la migración 14

| Control | Resultado de revisión |
| --- | --- |
| Múltiples artículos | Acepta 1–80 partidas únicas por solicitud. |
| Origen | Fijo a `central`; el destino debe ser una ubicación activa de tipo sucursal. |
| Cantidades | Positivas, con tres decimales como máximo; se bloquean y validan todos los saldos antes de escribir. |
| Atomicidad | La cabecera, todas las salidas y todas las entradas están en una sola función/transacción. Un error revierte todo. |
| Reintentos | `request_id` único más hash del payload y advisory lock. Repetir el mismo payload devuelve `replayed`; cambiarlo se rechaza. |
| Roles | Sólo `private.pw_is_manager()` puede entregar o revertir. La RLS existente limita la lectura por sucursal. |
| Inmutabilidad | No hay `UPDATE` ni `DELETE` en la función; una entrega sólo puede contrarrestarse con una reversión auditada si el destino aún conserva el saldo. |

## Simulador separado

La pestaña **Simulador aislado** de Inventario y `inventory-simulator.js` viven exclusivamente en memoria. El escenario lleva la marca `[SIMULADO]` y cubre:

1. Saldo inicial de pollo simulado en central.
2. Entrega a La Mora.
3. Entrega a Santa Cruz.
4. Merma en La Mora.
5. Rechazo de una entrega mayor al saldo.
6. Reintento de la misma solicitud sin movimientos duplicados.
7. Conciliación: `11 kg central + 4.5 kg Mora + 4 kg Santa Cruz = 19.5 kg`, después de `0.5 kg` de merma.

No se consulta Supabase, no se escribe `localStorage` y recargar la página elimina el escenario.

## Catálogo de insumos

Se añadieron plantillas no persistentes para pollo, sirloin, arrachera, papas, pan, queso, verduras, salsas, aceite, empaques y bebidas. No contienen costos, cantidades ni gramajes. La pantalla sólo prellena el formulario: guardar sigue siendo una acción explícita contra Supabase.

Las unidades admitidas son `kg`, `g`, `l`, `ml` y `pieza`. Cada artículo mantiene una única unidad base; el sistema no convierte ni mezcla familias de unidad. Antes de capturar producción real, validar con operación la unidad base específica de cada presentación de bebida, salsa, queso y empaque.

## Entregas pendientes y recepción

La migración 14 confirma un traspaso inmediatamente; por diseño no crea un estado en tránsito. Por ello no está lista aún para persistir responsable receptor, cantidades recibidas, diferencias o faltantes. Esos datos requieren una siguiente migración revisada con:

- cabecera y partidas de entrega en estado `pending` sin movimientos de inventario;
- confirmación idempotente de recepción que genere el asiento de transferencia una sola vez;
- rechazo de diferencias silenciosas; una merma o ajuste posterior debe ser otra operación auditada;
- políticas que permitan a la sucursal receptora confirmar sólo sus propias entregas;
- historial de pendientes, confirmadas, rechazadas y revertidas por sucursal.

No se debe activar la operación real hasta revisar esa migración, aplicar 14 y ejecutar `sql/tests/14_BRANCH_DELIVERIES_ISOLATED.sql` en una base local o rama Supabase desechable. El script comienza con `BEGIN` y termina con `ROLLBACK`.
