# Plebes Wings · Integración real con Supabase

**Estado:** Cambios del servidor aplicados al proyecto `plebes-wings-prod` (`rilrfcmmylldftioapnc`) el 10 de noviembre de 2026. La versión del portal incluida en esta entrega es local y **no se ha publicado en GitHub**. No se han creado ventas reales ni cargado documentos DOCX originales.

## Ventas y pedidos

Se reutilizaron `pw_sales`, `pw_sale_lines` y `pw_sale_payments`, que ya existían con RLS. Se añadieron dos columnas de idempotencia a `pw_sales`, un índice único y la función `public.pw_register_sale_v1(jsonb)`, con permiso `EXECUTE` solo para `authenticated` y validación interna de membresía activa owner/consultant. La función usa SECURITY INVOKER, recalcula importes desde el catálogo autorizado, rechaza productos inactivos y discrepancias en pagos, genera folio y guarda cabecera, líneas y pagos como una transacción atómica. Los reintentos con el mismo `request_id` devuelven la venta existente; el uso de ese ID con datos distintos se rechaza.

El portal comprueba el acceso a las tablas y llama a la función con una solicitud inválida `{}` que debe rechazarse antes de escribir. **Solo habilita «Nueva venta» si esa verificación es correcta**. El historial carga los 300 tickets más recientes desde Supabase, con partidas y pagos; el piloto histórico local sigue separado en JSON. No hace CFDI, control de devoluciones, tickets físicos ni descuenta insumos. La política de garantía «¿Sin ticket? Tu pedido es gratis» no está habilitada.

**Limitaciones:** Las políticas originales siguen permitiendo a managers hacer inserciones directas en las tablas fuera de la función; el frontend usa exclusivamente la RPC transaccional. No se han realizado pruebas con sesiones reales de owner/consultant, employee e inactivo, ni ventas de prueba en producción. El rol employee sigue sin acceso al portal.

## Biblioteca legal privada

Se creó el bucket **`pw-internal-documents`** como `public=false`, con tamaño máximo de 8 MB y tipos DOCX/PDF. Las políticas de Storage permiten exclusivamente a administradores activos listar, leer y subir versiones a carpetas `legal/pw-leg-01`, `legal/pw-leg-02` y `legal/pw-ops-03`; no permiten sobrescritura ni borrado a través de esas políticas. Se insertaron tres fichas en `pw_project_docs` con estado **Pendiente de revisión**, sin enlace público.

Los documentos originales **no estaban adjuntos al ZIP de código y no pudieron transferirse directamente desde la biblioteca a Storage**. En Biblioteca de entregables, después de instalar y autenticar el portal, utiliza «Cargar versión» para subir los DOCX originales. Verifica que se puedan consultar mediante URL firmada, y prueba permisos con un usuario sin acceso antes de uso operativo.

| Código | Archivo privado que debe subirse |
| --- | --- |
| PW-LEG-01 | `PW_01_Convenio_Confidencialidad_V2.docx` |
| PW-LEG-02 | `PW_02_Aviso_Privacidad_Personal_V2.docx` |
| PW-OPS-03 | `PW_03_Politica_Tickets_Inventario_Seguridad_V2.docx` |

Los documentos contienen datos pendientes (titular, RFC, domicilios, canal ARCO, etc.). No deben presentarse como convenios firmados ni políticas aprobadas.

## Pruebas y publicación

Ejecutar `node --check app.js`, `node --check sales-integration.js`, `node --check private-documents.js`, `node --test tests/*.test.mjs`. Comprobar login en incógnito, cierre de sesión, edición de catálogo, acceso a documentos y «Nueva venta» mediante Live Server. Las pruebas automatizadas usan mocks, por lo que no reemplazan la verificación con una sesión real. Mantener la rama `feat/ventas-supabase` hasta completar las pruebas. Revisar `git diff` antes de commit y push.

## Hallazgo de seguridad pendiente

Security Advisor de Supabase muestra `Leaked Password Protection Disabled`. Revisa y activa la protección en la configuración de Auth: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

## Corrección adicional del catálogo

`pw_products.id` era `text NOT NULL` sin valor por defecto. Se estableció `DEFAULT gen_random_uuid()::text` para que el formulario «Añadir presentación» pueda insertar un producto sin inventar su identificador en JavaScript. Los IDs existentes conservan su valor.
