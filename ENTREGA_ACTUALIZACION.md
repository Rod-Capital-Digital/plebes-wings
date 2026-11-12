# ACTUALIZACIÓN POSTERIOR AL DESPLIEGUE

La información histórica de esta entrega indicaba que faltaba desplegar SQL. **Las migraciones 08–12 se instalaron después**; para el estado actual consultar `ESTADO_DESPLIEGUE_08_12.md`.

---

# Plebes Wings — versión de desarrollo integrada (entrega)

## Qué contiene esta entrega

Se preservaron los archivos originales de la plataforma y su diseño visual. Se incorporaron:

- **Migración 08 existente**: documentos y partidas de compra, con RPC para crear, confirmar, recibir y anular.
- **Migración 09 nueva**: libro inmutable de movimientos de inventario, cantidades firmadas, RLS, recepción de compras convertida en entrada de inventario **atómica** y acciones controladas para saldo inicial y merma.
- **Migración 10 nueva**: sesiones de caja por sucursal y fecha, apertura/cierre por RPC, resumen desde ventas vigentes, pagos y gastos en efectivo.
- **Migración 11 nueva**: gasto operativo mediante RPC idempotente, con audit trail y comprobación de sucursal/caja cerrada.
- **Migración 12 nueva**: traspaso inmediato de inventario entre ubicaciones, sólo después de confirmar físicamente la entrega.
- **operations-integration.js**: consultas y llamadas RPC del frontend. Las nuevas pantallas de Inventario, Caja y Finanzas leen Supabase o indican bloqueo. Ya no presentan los cálculos locales del piloto como oficiales en esos tres módulos.
- **Catálogos**: formularios para capturar proveedores e insumos. El módulo Compras existente conserva sus funciones.
- **Pruebas**: la batería JavaScript completa se ejecutó localmente.

## Estado real y límites

**No se ejecutó ninguna migración nueva en `plebes-wings-prod`.** La conexión Supabase que usa el portal sigue apuntando al mismo proyecto, pero los nuevos módulos no estarán operativos hasta que un administrador aplique **en este orden** los SQL de 08, 09, 10, 11 y 12, con respaldo y ventana de mantenimiento. No se confirmó la ejecución SQL en PostgreSQL, sólo sintaxis JavaScript y pruebas estáticas/unitarias. No se crearon proveedores, insumos, saldos, compras, gastos, cierres, entregas, ventas ni usuarios ficticios.

Las operaciones de venta siguen en el RPC actual. **Los consumos de recetas y la salida automática de inventario por venta NO están activados**, porque faltan fichas técnicas y asignaciones producto/insumo. Sería peligroso inferir unidades consumidas. La transferencia en migración 12 es inmediata y no lleva un estado de tránsito; registra sólo entregas efectivamente confirmadas. **No se implementó contabilidad completa, utilidades netas, integración bancaria, facturación CFDI, inventario offline ni cierre que bloquee retroactivamente nuevas ventas**. Estos puntos requieren desarrollo posterior.

La pantalla de Inicio, Ruta y otros módulos del piloto conservan partes descriptivas del historial local. Las pantallas actualizadas de Inventario, Caja y Finanzas toman sus operaciones exclusivamente del servidor. No se debe asumir sincronización de cualquier función no descrita arriba.

## Pasos de reemplazo en Windows

1. Cerrar el navegador y detener el servidor Python (`Ctrl+C`) en la consola.
2. Respaldar la carpeta anterior completa (no sobrescribirla a ciegas).
3. Extraer este ZIP **en una carpeta nueva**, conservar `index.html`, `app.js`, `styles.css`, `operations-integration.js`, `purchases-integration.js`, `sql/`, `assets/` y demás archivos en el mismo nivel que aparecen en el ZIP.
4. Comparar cualquier cambio de código efectuado después de haber generado el ZIP original; esta entrega se basa solamente en el archivo subido aquí.
5. En la carpeta nueva ejecutar `py -m http.server 5500` y entrar en `http://localhost:5500`.
6. Comprobar que Ventas sigue funcionando y que Inventario, Caja y Finanzas muestran aviso de migración pendiente hasta desplegar el backend.

## Despliegue SQL (tarea separada, con acceso administrativo autorizado)

1. Generar un **respaldo recuperable** del esquema y datos actuales.
2. Confirmar que migración 07 sigue aplicada y que las políticas de autenticación/roles son las previstas.
3. Revisar y aplicar secuencialmente los archivos en `sql/08_*.sql`, `sql/09_*.sql`, `sql/10_*.sql`, `sql/11_*.sql`, `sql/12_*.sql`.
4. Revisar las políticas/RPCs con un usuario de cada rol; probar en entorno aislado si se dispone de él.
5. Ejecutar `sql/tests/08_PURCHASE_DOCUMENTS_AND_LINES_POST_DEPLOY_CHECKS.sql` y `sql/tests/09_12_POST_DEPLOY_READ_ONLY.sql` contra la base objetivo. El archivo de prueba RLS `08_*_ISOLATED_RLS.sql` no debe ejecutarse en producción.
6. Confirmar catálogo de proveedores/insumos reales y comenzar operación controlada.

La instalación del frontend por sí sola **no modifica el esquema de Supabase**.

## Permisos y observaciones

- La cuenta `owner` no existe todavía, según auditoría; por tanto, los ajustes privilegiados y anulaciones seguirán bloqueados. No crear roles arbitrariamente.
- Los usuarios de la app no reciben claves secretas de Supabase.
- Los movimientos contables quedan auditados. No borrar datos desde el navegador.
- No instalar ni cargar los archivos de respaldo o claves en repositorios públicos.
