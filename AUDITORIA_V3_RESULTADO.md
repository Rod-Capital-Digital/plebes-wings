# Plebes Wings V3 — Resultado de auditoría técnica

**Proyecto:** plebes-wings-prod · `rilrfcmmylldftioapnc`  
**Origen:** paquete V3 recibido para revisión  
**Estado de producción:** SIN CAMBIOS en esta revisión  
**Validación ejecutada:** 46 pruebas locales correctas; sintaxis JavaScript validada

## Hallazgos importantes y correcciones

| Prioridad | Hallazgo en el paquete original | Corrección preparada |
| --- | --- | --- |
| Crítica | La restricción `pw_sales_void_actor` fallaría sobre una venta de prueba que ya estaba anulada antes de existir `voided_by`/`voided_at`. | Columna `void_legacy`, etiquetado explícito de anulaciones previas; no se inventan fecha ni usuario. Las nuevas anulaciones exigen ambos campos. |
| Alta | La sonda de la RPC buscaba `inválido`, pero `pw_register_sale_v2` responde `invalido`; bloqueaba la caja aun con la RPC desplegada. | La validación acepta ambas formas ortográficas y rechaza errores de privilegios. |
| Alta | La función de ventas `SECURITY DEFINER` podía responder información del `request_id` existente antes de comprobar al creador del ticket. | Verificación del creador y sucursal del empleado antes de retornar una repetición idempotente. |
| Alta | El botón «Descargar respaldo local» se mostraba sin autenticación, en una terminal potencialmente compartida. | Se retiró el acceso previo a autenticación. El historial local no fue borrado. La exportación administrativa permanece. |
| Alta | El panel del empleado cargaba el historial local completo del navegador, potencialmente proveniente del propietario. | En inicio de sesión de empleado se carga únicamente un estado limpio y el catálogo autorizado de Supabase; no se lee el historial local. |
| Media | `display:flex` de la navegación podía prevalecer frente al atributo HTML `hidden`. | Regla global `[hidden]{display:none!important}` y prueba asociada. |
| Media | Empleados consultaban sin necesidad el bucket jurídico privado (aunque Storage podía negar acceso). | Se omite toda esa consulta para la sesión de empleado. |
| Media | El formulario de anulación aceptaba patrones inválidos de UUID y no validaba el máximo de 400 caracteres. | Validación estricta de formato UUID y longitud de motivo. |
| Media | «Mi turno» mostraba cifras acumuladas de todo el historial de la sucursal. | Se limita el resumen a ventas activas del día y de la sucursal asignada. |

## Compatibilidad verificada con la base de producción mediante consultas de lectura

- Existe `public.pw_sales`, con un ticket histórico en estado `void` que carece de columnas de auditoría de V3.
- `public.pw_audit_events` contiene `user_id`, `module`, `action`, `entity_id`, `metadata` y `created_at`; su `id` es una identidad generada.
- `public.pw_members` tiene el rol `employee` y `branch_id`; los propietarios y consultores no tienen sucursal asignada.
- Están disponibles `private.pw_is_manager()` y las políticas de lectura de ventas que aíslan las sucursales.
- Las funciones `public.pw_register_sale_v2` y `public.pw_void_sale_v1` todavía NO están desplegadas.

## Límites de la validación

- **No se ejecutó ninguna migración en producción.** Tampoco se crearon empleados, ventas ni anulaciones.
- **No se ejecutaron las funciones nuevas dentro de PostgreSQL.** La revisión SQL es estática y contra metadatos del esquema existente; podría descubrirse otra incompatibilidad en staging.
- Las 46 pruebas se ejecutaron con Node.js; incluyen pruebas de módulos y contratos SQL, **no** sustituyen pruebas de API con JWT de empleado y de propietario.
- El historial visible de ventas está limitado a los últimos **300 tickets** consultados: los totales son parciales si existe un volumen mayor. Antes de usarlo para conciliación financiera, se debe implementar paginación o agregación por fecha en servidor.
- El panel empleado no permite editar productos, anular ventas ni descargar documentos internos. Inventario físico, merma, incidentes y corte de caja del empleado **siguen pendientes** de persistencia segura. No deben habilitarse como si estuvieran terminados.
- El historial legado aún puede residir en `localStorage` del dispositivo. Evita reutilizar el mismo perfil de navegador para empleados hasta completar migración y limpieza controlada del historial local.

## Despliegue seguro propuesto

1. Conservar el commit/rama actual; generar copia de la base y confirmar que existe un entorno staging.
2. Aplicar `sql/06_MULTIROl_ANULACION_SEGURA_PREPARADA.sql` **solo en staging** en una transacción, con revisión humana del SQL final.
3. Probar JWT reales de owner, consultant, empleado La Mora, empleado Santa Cruz y miembro inactivo.
4. Comprobar registro por sucursal, intento de anulación por empleado, anulaciones administrativas con auditoría atómica, reintentos idempotentes y rechazo de INSERT/UPDATE/DELETE directos.
5. Validar que el ticket histórico anulado conserve su motivo, `void_legacy=true` y fechas de auditoría nulas, sin asignarle datos ficticios.
6. Solo tras las pruebas y autorización explícita, planificar migración de producción y despliegue coordinado del frontend.

## Tests

Ejecutados satisfactoriamente desde el paquete corregido:

```sh
node --check app.js
node --check sales-integration.js
node --test tests/*.test.mjs
```

**46 pruebas — 46 aprobadas — 0 fallidas.**

Este informe documenta una corrección preparada para pruebas. No certifica la seguridad integral en producción.
