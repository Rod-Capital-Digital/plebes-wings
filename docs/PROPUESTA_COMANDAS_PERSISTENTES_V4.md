# Propuesta V4: comandas persistentes

Estado: propuesta de diseño; no aplicar en Supabase sin revisión y migración aprobada.

El POS actual puede imprimir una comanda local marcada como borrador. No crea ventas, no aparta inventario y no modifica ingresos. Para una comanda que sobreviva a un reinicio se requiere una ruta distinta de las ventas confirmadas:

- `pw_kitchen_orders`: id UUID, `branch_id`, `status` (`open`, `preparing`, `ready`, `cancelled`), nota, usuario creador, marcas de tiempo e identificador idempotente.
- `pw_kitchen_order_lines`: producto, cantidad y orden de preparación. No debe aceptar precio enviado por el navegador.
- RPC transaccionales: crear borrador, actualizar únicamente borradores propios/de la sucursal, cambiar estado por personal autorizado y convertir una comanda en venta mediante `pw_register_sale_v2` o una RPC coordinada.
- RLS: el empleado solo puede crear/leer comandas de su sucursal y no puede anular ni alterar importes; el administrador conserva la trazabilidad de cambios. Las funciones con privilegios deben validar `auth.uid()`, rol activo y sucursal dentro de PostgreSQL.
- Auditoría: cambios de estado, usuario, hora, motivo de cancelación y vínculo al ticket final; ninguna eliminación física.

Antes de implementarlo se necesitan pruebas con JWT reales por rol, una migración revisada, un procedimiento de reversión y confirmación de que la conversión no duplica cobros al reintentar.
