# Reporte de pruebas y pendientes

## Corrección de envío del inicio de sesión

**Causa raíz:** el formulario `#auth-form` no declaraba `method` ni `action`. Si `app.js` no terminaba de cargar o no registraba su manejador, el navegador aplicaba su valor predeterminado: `GET` a la página actual, serializando `email` y `password` en la URL.

Se cambió el respaldo HTML a `method="post" action="#auth-gate"` y se añadió una barrera inline, en fase de captura, que ejecuta `preventDefault()` antes de cargar `supabase-config.js`, `app.js` o cualquier dependencia. Si el módulo falla, la barrera muestra un mensaje y bloquea el envío nativo; no hay una ruta GET que pueda incorporar credenciales a la URL.

Pruebas ejecutadas:

- Simulación del evento `submit` con el módulo de la app ausente: el guardia de captura llamó a `preventDefault()` y mostró el estado de error.
- Verificación estática del respaldo `POST` y del `action` seguro.
- Verificación de sintaxis de `app.js` y `supabase-client.js`.
- Configuración de otro proyecto Supabase simulada: el cliente la rechazó por no coincidir con la URL esperada de Plebes Wings.
- Auditoría de llamadas: el inicio de sesión usa `supabase.auth.signInWithPassword()` y las tablas se consultan solo en modo lectura.

La prueba con una cuenta válida y una cuenta inválida queda pendiente de credenciales de prueba autorizadas. Nunca se usaron ni se registraron contraseñas en esta revisión.

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
