# Plebes Wings V2 — Estado del despliegue Supabase 08–12

**Fecha de aplicación:** 11 de noviembre de 2026 (hora de México).  
**Proyecto:** `plebes-wings-prod` — `rilrfcmmylldftioapnc`.

## Migraciones instaladas en producción

| Migración | Resultado | Componentes |
|---|---|---|
| 07 | Preexistente y confirmada | Proveedores, artículos y ubicaciones |
| 08 | Aplicada exitosamente | `pw_purchase_documents`, `pw_purchase_lines` y cuatro RPC de compras |
| 09 | Aplicada exitosamente | `pw_inventory_transactions`, `pw_inventory_movements`, `pw_inventory_balances`, RPC de movimientos y trigger de recepción |
| 10 | Aplicada exitosamente | `pw_cash_sessions` y tres RPC de caja |
| 11 | Aplicada exitosamente | `pw_expense_request_keys`, RPC de gastos y revocación de INSERT directo a `pw_expenses` |
| 12 | Aplicada exitosamente | RPC de traspasos y ampliación de movimientos a tipo transfer |

## Verificación realizada directamente en Supabase

- **27 tablas `pw_`** visibles; las 6 tablas nuevas de 08–11 tienen RLS habilitado.
- **10 funciones RPC nuevas** detectadas en PostgreSQL.
- **1 trigger** de recepción de compras para contabilizar entradas de inventario.
- `pw_expenses`: el rol `authenticated` tiene SELECT pero **no INSERT directo**; la escritura se realiza por `pw_record_expense_v1`.
- Sin movimientos creados en `pw_purchase_documents`, `pw_inventory_movements`, `pw_cash_sessions`, `pw_expenses` o `pw_sales`.
- 73/73 pruebas JavaScript y de contratos completadas sobre esta entrega.

**Limitación de la verificación:** se revisaron estructura, privilegios, instalación de funciones y sintaxis JS. No se completaron pruebas de ejecución de todos los RPC con usuarios reales ni restauración de un respaldo completo. La aplicación de cambios en producción implica riesgo y no equivale a aceptación operativa final.

## Operación en V2

- **Compras:** crear borrador → confirmar → recibir. La recepción registrada genera movimientos de inventario automáticamente desde migración 09; el mismo evento no se contabiliza dos veces.
- **Inventario:** alta de insumos, saldo inicial, mermas y traspasos inmediatos entre ubicaciones. Los saldos se leen del libro de movimientos, no de `localStorage`.
- **Caja:** apertura/cierre de la jornada y cálculo de efectivo con ventas activas y gastos de caja. No se bloquea automáticamente una venta tardía después del cierre.
- **Finanzas:** gastos registrados en Supabase por RPC y totales resumidos; **no es contabilidad ni utilidad neta completa**.

## Elementos aún pendientes

1. **Catálogo real:** faltan proveedores, artículos de inventario y sus unidades verificadas. No se insertaron datos de muestra.
2. **Recetas/fichas técnicas:** no se descuentan insumos automáticamente al vender ni se calcula el costo por receta sin cantidades reales.
3. **Propietario:** no existía una membresía `owner` activa en la auditoría anterior. Mientras no se asigne legítimamente, las acciones reservadas a propietario seguirán restringidas.
4. **Entrega en tránsito:** la transferencia implementada es inmediata tras confirmación física, no separa despacho y recepción pendientes.
5. **Caja:** los retiros se capturan como total del cierre; todavía no existe un libro detallado de movimientos de efectivo ni bloqueo de ventas tardías de la jornada cerrada.
6. **Seguridad:** los avisos de Supabase por RPC `SECURITY DEFINER` autorizadas deben ser revisados; el diseño usa comprobaciones internas de membresía y `search_path` fijo. Persisten operaciones legadas que requieren transición gradual.
7. **Respaldo:** no se generó ni restauró un respaldo completo verificable durante este despliegue. Configurar copia de seguridad cuanto antes.
8. **Pruebas funcionales:** el uso efectivo requiere instalación del frontend actualizado e iniciar sesión con cuentas autorizadas.

## Reemplazo del portal

1. Mantén la V1 o V2 anterior como respaldo; nunca sobrescribas sin copiar.
2. Extrae este paquete en una carpeta nueva y abre `index.html` mediante `py -m http.server 5500`.
3. Inicia sesión con tu usuario habitual; consulta `#abasto`, `#inventario`, `#caja`, `#finanzas`.
4. No captures importes, compras ni stock reales hasta validar el catálogo y permisos con responsables de Plebes Wings.
5. Los archivos `sql/` reflejan las migraciones que se aplicaron. **No vuelvas a ejecutar esas migraciones manualmente.**

## Integración visual

Se ajustó la interfaz para reflejar la recepción automática en inventario, filtrar compras por sucursal en el resumen financiero, mostrar cantidades con hasta tres decimales, impedir visualmente reabrir una jornada ya cerrada y ocultar la anulación de compras a una cuenta consultora sin rol propietario.
