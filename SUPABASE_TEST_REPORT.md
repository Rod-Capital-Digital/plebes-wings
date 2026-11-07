# Reporte de pruebas y pendientes

## Ejecutado localmente

- `node --check` aprobó `app.js`, `supabase-client.js` y `supabase-config.js`.
- La plantilla de configuración se verificó desactivada: no contiene URL ni clave, por lo que no puede iniciar solicitudes ni exponer secretos.
- Se verificó el balance estructural de llaves CSS.
- La exportación JSON existente se expuso también desde la pantalla de acceso, antes de iniciar sesión o cualquier futura migración.

## Pendiente de ejecutar contra `plebes-wings-prod`

No fue posible realizar consultas reales ni pruebas RLS: la conexión de Supabase disponible para este entorno no lista el proyecto `plebes-wings-prod`; solo muestra proyectos ajenos que no se tocaron. Al proporcionar acceso al proyecto correcto y completar `supabase-config.js`, ejecute estas pruebas con sesiones reales:

| Caso | Resultado esperado |
| --- | --- |
| Sin sesión | La pantalla de acceso se mantiene; no se solicita ninguna tabla. |
| Sesión sin `pw_members.active = true` | Mensaje de acceso denegado y cierre de sesión. |
| `owner` | Puede recibir ambas filas autorizadas de `pw_branches` y el catálogo. |
| `consultant` | Puede recibir las sucursales y catálogo permitidos por RLS. |
| `employee` de `mora` | Solo recibe `mora` de `pw_branches`; la interfaz no muestra módulos privados ni datos locales. |
| `employee` de `mora` intentando `santacruz` | RLS no debe devolver la fila de Santa Cruz. |
| `employee` intentando `pw_product_costs` | RLS debe devolver cero filas o error de permiso. |

Antes de abrir el uso operativo, confirme en el SQL Editor que RLS está activo en las 18 tablas `pw_`, y ejecute las pruebas desde el frontend autenticado, no con privilegios administrativos.
