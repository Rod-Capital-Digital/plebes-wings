# Conexión segura con Supabase

## Estado de esta entrega

La integración está preparada, pero viene desactivada: `supabase-config.js` no contiene URL ni clave. En ese estado, el portal conserva su modo local y no hace solicitudes de red. No se modificó ninguna tabla ni se habilitaron escrituras hacia Supabase.

## Configuración para `plebes-wings-prod`

1. Desde el panel del proyecto correcto, copie la URL pública del proyecto y una clave pública activa cuyo valor inicie con `sb_publishable_`.
2. Edite únicamente `supabase-config.js`:

```js
window.PW_SUPABASE_CONFIG = Object.freeze({
  url: 'https://<referencia-del-proyecto>.supabase.co',
  publishableKey: 'sb_publishable_<clave-pública>'
});
```

3. Publique esos archivos mediante Live Server o GitHub Pages. La clave pública puede estar en el navegador; **no** agregue claves secretas, `service_role`, contraseñas ni tokens administrativos.
4. Pruebe con usuarios reales de Auth que ya tengan una fila activa en `public.pw_members`.

La app carga `@supabase/supabase-js` **2.119.0**, con versión fija, desde jsDelivr y solo cuando la configuración pública es válida. Así se mantiene la compatibilidad con HTML estático, Live Server y GitHub Pages, sin instalar un bundler.

## Esquema leído y consultas implementadas

El mapeo se basó en el SQL de instalación entregado, no en nombres inferidos.

| Tabla | Campos leídos por el frontend | Uso |
| --- | --- | --- |
| `pw_members` | `user_id`, `display_name`, `role`, `branch_id`, `active` | Valida la membresía y el rol de la sesión actual. |
| `pw_branches` | `id`, `name`, `location_description`, `active` | Sustituye las sucursales locales cuando la respuesta pasa validación. |
| `pw_products` | `id`, `name`, `unit`, `sale_price`, `detail`, `active`, `updated_at` | Sustituye el catálogo/precios local cuando la respuesta pasa validación. |

No se leen `pw_product_costs`, compras, ventas, pagos, entregas, inventario, gastos, caja, tareas ni documentos. No hay llamadas `insert`, `update`, `upsert`, `delete`, RPC ni migraciones en el navegador.

## Comportamiento de acceso

- Sin configuración válida: sigue el portal local existente.
- Con configuración válida y sin sesión: se muestra la pantalla de inicio de sesión y el portal queda oculto.
- Con sesión sin membresía activa: se cierra la sesión y se informa acceso denegado.
- `owner` y `consultant`: ven el portal existente; solamente sucursales y catálogo se sincronizan en modo lectura. Los demás módulos siguen siendo locales.
- `employee`: recibe una pantalla restringida con su sucursal autorizada y el catálogo. No se renderizan datos locales de ventas, costos, compras, caja, finanzas, documentos ni configuración.

La autorización definitiva permanece en RLS. Ocultar módulos es una medida de interfaz, no un sustituto de las políticas de la base de datos.
