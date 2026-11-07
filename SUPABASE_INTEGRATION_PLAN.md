# Preparación de Supabase — Plebes Wings

Estado: **sin conexión operativa**. El portal conserva el funcionamiento local hasta validar esquema, RLS y restricciones por sucursal.

## Persistencia actual auditada

`app.js` mantiene todo el estado en un objeto `data` y lo serializa como JSON en `localStorage` mediante la clave `plebes-wings-piloto-v1`.

- `products`: catálogo y precio/costo de referencia.
- `sales`: ticket, fecha, sucursal, líneas, pagos, referencia, notas y anulaciones.
- `deliveries`, `purchases`, `waste`, `expenses`, `closings`: movimientos operativos y de caja.
- `openingStock`: inventario de partida indexado por sucursal y producto.
- `tasks` y `docs`: seguimiento de la consultoría y enlaces autorizados.
- `ui`: filtros y pestañas de la sesión; no se persiste.

Las altas, ediciones, anulaciones e importaciones llaman a `save()`, que escribe el objeto completo. Los respaldos JSON sustituyen el estado local, y la exportación CSV solo cubre ventas. No hay solicitudes HTTP, usuarios, sesiones ni sincronización entre equipos.

## Dependencias y configuración pendientes

1. Dar acceso al proyecto `plebes-wings-prod` en la integración de Supabase y confirmar su identificador de proyecto.
2. Inspeccionar, en modo de solo lectura, las 18 tablas `pw_` con sus columnas, claves, restricciones, índices, triggers y políticas RLS. No se deben deducir nombres a partir de este prototipo.
3. Obtener la URL del proyecto y una clave pública activa con prefijo `sb_publishable_`. Nunca usar `service_role`, claves secretas ni contraseñas en archivos de frontend.
4. Añadir `@supabase/supabase-js` con versión fijada y lockfile cuando se defina el empaquetado (el proyecto actual es HTML/CSS/JS sin npm ni bundler).
5. Decidir cómo migrar o importar los datos de `localStorage`, con respaldo JSON previo, mapeo validado por columna y prueba en entorno no productivo.

## Secuencia de implementación propuesta

1. Crear un cliente aislado con `createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)`, cargando ambos valores desde configuración de despliegue, no desde código versionado.
2. Implementar solo Auth en modo de lectura: inicio/cierre de sesión, restauración de sesión y una pantalla de estado. No se habilitarán operaciones de negocio todavía.
3. Definir los perfiles propietarios, consultor y empleados en datos controlados por servidor. La autorización no debe depender de `user_metadata` editable por el usuario ni de ocultar botones en el navegador.
4. Diseñar y probar RLS por tabla con el esquema real: propietarios para ambas sucursales; empleados limitados a su sucursal y a sus acciones aprobadas; consultor con el alcance acordado. Las políticas de actualización deben usar tanto `USING` como `WITH CHECK`.
5. Verificar que las tablas necesarias estén expuestas de manera intencional en la Data API, con RLS habilitado y permisos mínimos. Revisar también Storage para documentos privados y URLs temporales si aplica.
6. Ejecutar pruebas con cuentas de cada perfil para lectura, inserción, modificación, anulación, acceso cruzado entre sucursales y registros no autorizados. Solo entonces sustituir, por módulo, las escrituras locales.

## Decisiones de seguridad ya fijadas

- Frontend: únicamente clave `sb_publishable_`.
- Sin consultas ni escrituras a las tablas hasta conocer esquema y RLS.
- Sin cambios destructivos de tablas existentes.
- El modo local y la exportación de respaldo se conservan durante la migración gradual.
