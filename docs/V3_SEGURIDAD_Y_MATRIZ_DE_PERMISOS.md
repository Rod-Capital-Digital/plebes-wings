# Plebes Wings V3 — seguridad y permisos

Estado: cambios preparados para revisión; la migración `sql/06_MULTIROl_ANULACION_SEGURA_PREPARADA.sql` no se ha aplicado.

| Capacidad | owner | consultant | employee |
| --- | --- | --- | --- |
| Panel administrativo | Sí | Sí | No |
| Panel operativo | No aplica | No aplica | Solo sucursal asignada |
| Leer tickets | Todas las sucursales autorizadas | Todas las sucursales autorizadas | Solo su sucursal por RLS |
| Registrar venta | RPC `pw_register_sale_v2` | RPC `pw_register_sale_v2` | RPC `pw_register_sale_v2`, sucursal forzada por servidor |
| Editar precios / catálogo | Sí, según políticas existentes | Sí, según políticas existentes | No |
| Anular venta | RPC `pw_void_sale_v1` | RPC `pw_void_sale_v1` | No |
| Consultar bitácora | Sí | Según política vigente (actualmente solo owner) | No |
| Cambiar membresía o sucursal | Gestión administrativa externa | Gestión administrativa externa | No |

## Controles preparados

- La venta se calcula con `pw_products.sale_price` bloqueado en el servidor; el cliente no fija precios, usuario o sucursal de empleado.
- Un bloqueo asesor transaccional y `request_id` único hacen idempotente el registro de venta.
- La anulación bloquea la fila, solo permite `active → void`, exige motivo, conserva líneas y pagos, y agrega el evento de auditoría en la misma transacción.
- Las anulaciones anteriores a V3 se etiquetan con `void_legacy = true`, sin inventar responsables ni fechas. Los nuevos tickets anulados exigen actor y momento.
- La ruta de reintento idempotente comprueba también el creador del ticket, antes de devolver datos de una venta existente.
- Las funciones con privilegio elevado fijan `search_path`, revocan `PUBLIC` y `anon`, y conceden ejecución solo a `authenticated`; la función valida `auth.uid()` y la membresía por sí misma.
- Se eliminan las políticas de escritura directa para ventas, líneas y pagos. RLS sigue controlando las lecturas de rama.

## Plan de prueba real (staging)

1. Crear dos usuarios de prueba: empleado La Mora y empleado Santa Cruz; ambos con membresía activa y sucursal distinta.
2. Con JWT de La Mora, comprobar que `pw_sales`, líneas y pagos de Santa Cruz devuelven cero filas y que `pw_register_sale_v2` con `branch_id: santacruz` falla con `42501`.
3. Con JWT de empleado, invocar `pw_void_sale_v1`; debe fallar con `42501`. Con owner o consultant, debe anular una sola vez y crear un evento `sales/sale_voided`.
4. Repetir el mismo `request_id` simultáneamente; confirmar un único ticket y una respuesta `replayed: true`.
5. Intentar `UPDATE`, `INSERT` y `DELETE` directos en las cuatro tablas de venta/auditoría con JWT de cada rol; deben ser rechazados.
6. Probar sesión caducada y desconexión durante reintento. No reintentar con un `request_id` diferente hasta consultar el historial.

## Auditoría adicional de integración (revisión local)

- Corregido el mensaje de comprobación de RPC: ahora acepta `inválido` e `invalido`.
- En dispositivos compartidos, el panel de empleado no carga el historial local administrativo desde `localStorage`, y no consulta el almacenamiento jurídico privado.
- Forzado `[hidden]{display:none!important}` para que enlaces administrativos ocultos por rol no reaparezcan por estilos `display:flex`.
- El resumen del empleado muestra únicamente las ventas del día de su sucursal.
- Retirado el botón de respaldo previo a autenticarse. El archivo local anterior no se borra: el propietario puede exportarlo desde el panel administrativo tras iniciar sesión.
- El módulo de existencias físicas y el reporte persistente de incidencias **aún no están implementados**. El panel del empleado solo ofrece catálogo, consulta de tickets y captura de ventas una vez desplegada y validada la migración.
- Faltan pruebas de integración con JWT de empleado La Mora y Santa Cruz en **staging**. Las pruebas de Node/SQL son principalmente unitarias o de contrato.
- La migración no debe ejecutarse desde Codex MCP en modo lectura, ni aplicarse a producción sin revisión humana y respaldo.

- El historial remoto se consulta con `limit(300)`; no utilizar ese resumen como reporte financiero integral cuando existan más de 300 tickets.
