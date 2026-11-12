# Plebes Wings V3 — plan controlado de despliegue

Estado al 11 de noviembre de 2026: **no ejecutar todavía en producción**.

## Evidencia revisada

- Proyecto: `rilrfcmmylldftioapnc` (`plebes-wings-prod`).
- PostgreSQL remoto: 17.11.
- Migraciones remotas actuales: ventas atómicas V1, documentos privados V1 y valor predeterminado de producto V1. V3 no está aplicada.
- Existen las dos sucursales activas: `mora` y `santacruz`.
- `pw_sales` ya tiene `request_id`, `request_payload` y el índice único parcial requerido para idempotencia.
- Hay un ticket histórico en estado `void`; V3 debe conservarlo y marcarlo como `void_legacy=true`, sin atribuirle usuario ni fecha.
- El equipo actual no tiene Supabase CLI, Docker Desktop ni carpeta `supabase/`. PostgreSQL 17 está instalado, pero sus binarios (`pg_dump`, `pg_restore`) no están en `PATH`. No es posible crear ni verificar un clon local desde esta estación sin instalar Docker y disponer de la CLI.

## Respaldo obligatorio y prueba de restauración

No usar el proyecto de producción como entorno de prueba. Antes de autorizar V3, un administrador del proyecto debe completar y registrar:

1. En Dashboard → Database → Backups, identificar el último respaldo recuperable anterior a la ventana de despliegue y registrar su hora, tipo y retención.
2. Generar una copia lógica fuera del proyecto con Supabase CLI, conservada cifrada fuera del repositorio. El respaldo debe separar roles, esquema y datos. No guardar contraseña, URL de conexión ni archivos de respaldo dentro de Git.
3. Incluir una copia separada de los objetos de Storage. El respaldo de base de datos conserva metadatos de Storage, no los archivos.
4. Descargar el respaldo y verificar su hash SHA-256 y el tamaño de cada archivo.
5. Restaurar el respaldo en un PostgreSQL/Supabase local aislado o en una infraestructura temporal autorizada. No usar otro proyecto Supabase para esta validación.
6. Comparar con producción, antes de V3: versiones de extensión, lista de tablas públicas, funciones/políticas/RLS, conteos por tabla y las tres migraciones remotas existentes.
7. Conservar el registro de la restauración correcta (fecha, responsable, hash, conteos y resultado de `pg_restore`/`psql`).

Si no se dispone de CLI y Docker en esta estación, la alternativa controlada es instalar herramientas en una estación administrativa aislada y restaurar allí el respaldo descargado. No instalar herramientas ni copiar datos de producción a equipos no autorizados.

## Preparación de pruebas JWT

Las siguientes sesiones deben existir solamente en el clon restaurado/local. No crear estas cuentas ni datos de prueba en producción.

| Sesión | Membresía esperada | Validaciones mínimas |
| --- | --- | --- |
| Administrador | `owner` o `consultant`, activa | Registrar venta, anular una venta activa y observar el evento de auditoría. |
| Empleado La Mora | `employee`, activa, `branch_id=mora` | Registrar solo en La Mora; no leer Santa Cruz, costos ni bitácora; no actualizar productos; no anular. |
| Empleado Santa Cruz | `employee`, activa, `branch_id=santacruz` | Equivalente, con aislamiento inverso. |
| Usuario inactivo | membresía inactiva | No leer datos operativos ni ejecutar RPC. |

Para cada caso, usar un JWT de esa sesión y conservar únicamente los identificadores de prueba retornados por la RPC, no los JWT ni contraseñas. Los intentos obligatorios son:

1. Consultas de ventas, líneas y pagos de la otra sucursal: cero filas o denegación por RLS.
2. `pw_register_sale_v2` con una `branch_id` distinta para cada empleado: error `42501`.
3. `pw_void_sale_v1` desde ambos empleados: error `42501`.
4. `INSERT`, `UPDATE` y `DELETE` directos contra `pw_sales`, `pw_sale_lines`, `pw_sale_payments` y `pw_audit_events`: denegados.
5. `INSERT` y `UPDATE` directos contra `pw_products` y lectura de `pw_product_costs`: denegados para empleados.
6. Dos llamadas concurrentes con el mismo `request_id` y el mismo payload: un único ticket, con la segunda respuesta `replayed=true`.
7. Reutilización de `request_id` con payload distinto: rechazada.
8. Anulación administrativa: transición única `active → void`, motivo obligatorio, `voided_by`, `voided_at` y un evento `sales/sale_voided` en la misma transacción.
9. Ticket histórico: conserva el estado y motivo existentes, `void_legacy=true`, sin actor ni hora inventados.

## Secuencia de despliegue

1. Congelar el uso del portal y confirmar que no hay capturas en curso.
2. Confirmar respaldo restaurado y las pruebas JWT anteriores aprobadas en el clon.
3. Registrar hash SHA-256 de `sql/06_MULTIROl_ANULACION_SEGURA_PREPARADA.sql` y el instante de inicio.
4. Aplicar la migración una sola vez, como transacción completa. No desactivar RLS ni conceder privilegios temporales.
5. Ejecutar comprobaciones posteriores con sesiones administrativas y de empleado; no generar tickets de prueba en producción.
6. Publicar el frontend V3 solo después de que `pw_register_sale_v2` responda a la sonda inválida esperada y las políticas/RPC coincidan.

## Comprobaciones posteriores al despliegue

- V3 figura en historial de migraciones; existen ambas RPC con firmas esperadas.
- Las funciones `SECURITY DEFINER` tienen `search_path` vacío, validan `auth.uid()` y revocan `EXECUTE` a `PUBLIC` y `anon`.
- `authenticated` no conserva DML directo en tablas de venta/auditoría.
- No permanecen las políticas `pw_sales_insert`, `pw_sales_update`, `pw_lines_insert` ni `pw_payments_insert`.
- Todas las tablas expuestas mantienen RLS activo.
- El portal muestra tickets remotos y permite ventas solo después de que la sonda de V2 esté disponible.
- Un empleado no ve rutas administrativas, costos, utilidades, otras sucursales ni la acción de anulación; las mismas denegaciones se repiten a nivel PostgreSQL.
- Se revisan asesores de seguridad y registros de errores después de la primera ventana operativa.

## Recuperación

- Si la migración falla antes de `COMMIT`, PostgreSQL debe revertirla completa: detener, conservar el error y no reintentar sin revisión.
- Si la migración confirma pero falla la validación **antes de ventas reales V3**, mantener el portal fuera de operación y restaurar el respaldo verificado o aplicar una reversión revisada por un administrador.
- Si ya existen ventas V3, no restaurar a ciegas: exportar y conciliar primero todos los tickets posteriores al punto de recuperación para evitar pérdida de ingresos y trazabilidad.
- No borrar eventos de auditoría para retirar pruebas; las pruebas se realizan solo en el clon y se limpia restaurando/recreando ese entorno local aislado.
