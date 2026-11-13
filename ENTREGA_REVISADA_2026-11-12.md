# Plebes Wings V2 — paquete revisado

## Cómo instalar esta versión sin perder el trabajo

1. **Respalda primero** toda tu carpeta actual `Plebes_Wings_Portal_V2_MENU_REAL` y los archivos locales que no estén publicados. Mantén el repositorio Git y sus cambios existentes.
2. Descomprime este ZIP en una ubicación temporal. Dentro encontrarás una sola carpeta `Plebes_Wings_Portal_V2_MENU_REAL` con los archivos corregidos, documentación y pruebas. No hay una V3 o V4.
3. Compara y copia los archivos modificados en la carpeta existente, conservando su carpeta `.git`, configuración y los cambios locales más recientes si se hubieran producido después de cargar este ZIP. **No uses `git reset --hard`** ni sobrescribas modificaciones recientes sin revisar.
4. En Visual Studio Code, abre esa carpeta e inicia el servidor local con `py -m http.server 5500` (en Windows); visita `http://127.0.0.1:5500/index.html`.
5. Con Node.js ejecuta `node --test tests/*.test.mjs`. Se verificaron 114 pruebas locales aprobadas, sin PostgreSQL de prueba disponible.
6. Aún **NO ejecutes** los archivos `sql/14...`, `15...`, `16...` o `17...` en producción. Preparar y validar un entorno PostgreSQL aislado y un respaldo restaurable antes de autorizarlos.

## Cambios implementados

- Recuperación por usuario de pedidos locales aún no cobrados; separación entre comanda y ticket confirmado; prevención conservadora de reintentos cuando el resultado de una venta es incierto.
- Corregido el acceso en interfaz para que empleados puedan iniciar recepción de entregas de su sucursal, siempre sujeto a verificación RLS en servidor.
- Preparación de entrega únicamente cuando el backend del flujo pendiente responde disponible; no se finge una migración aplicada.
- Reintentos estables de compras y recepciones, mejores validaciones de fecha/costo y control para que una compra parcialmente recibida no cuente como compra totalmente recibida.
- Corrección de cálculo para no asignar precio $0 a insumos sin costo conocido; correcciones estáticas de migraciones 15 y 17.
- Tests de contratos, costos, inventario, transacciones y flujos documentales actualizados.

## Advertencias importantes

**El sistema completo todavía no está certificado para operaciones reales de ambas sucursales.** La puesta en marcha requiere instalar y ensayar migraciones, verificar permisos y usuarios, registrar inventario de apertura, proveedores, costos y recetas auténticos, y validar las conciliaciones financieras. El consumo automático de ingredientes por venta sigue **deshabilitado** porque activar una operación así sin integridad transaccional puede producir inventarios o costos falsos.

Las imágenes de los productos se mantienen. No se añadió impresión Bluetooth ni agente de IA; ambos se habían reservado para después de estabilizar el POS.

El paquete no realiza cambios de base de datos por sí solo. No comparte archivos `.git`, claves secretas de servidor ni respaldos de producción.
