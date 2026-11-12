# Plebes Wings V2 — Menú comercial confirmado

Actualización de precios confirmada por el responsable el 11 de noviembre de 2026.

## Qué se cambió

- En Supabase `pw_products`: 18 presentaciones activas con precio oficial; 16 nuevas, y Alitas/Boneless actualizadas a $130 MXN.
- `ham` y `pap` se conservan inactivos. No se eliminaron productos históricos.
- En la toma de pedidos, los productos inactivos dejan de aparecer como tarjetas.
- Las hamburguesas y papas nuevas reutilizan la fotografía de su categoría; el resto utiliza el icono genérico salvo Alitas y Boneless.
- `data/menu_real_plebes_wings.json` y `.csv` documentan productos, variantes y presentaciones.
- `sql/13_MENU_COMERCIAL_CONFIRMADO.sql` documenta la operación efectuada; **NO volver a ejecutarlo en producción** sin revisar cambios posteriores.

## Qué queda pendiente

- Confirmar el texto de gramajes impreso como `075 g` para Alitas y Boneless.
- Confirmar cantidades de papas de acompañamiento, recetas, insumos, precios de compra, gramajes netos, aderezos/opciones, disponibilidad y existencias por sucursal.
- Habilitar configuración estructurada de salsas y condimentos en la comanda; el campo Observaciones sigue siendo texto libre.
- Las ventas **no descuentan inventario por receta** hasta definir fichas técnicas.
- Verificar manualmente acceso multiusuario y permisos del negocio.

## Cómo abrir

1. Conservar la carpeta anterior como respaldo.
2. Abrir esta carpeta en Visual Studio Code o Terminal.
3. Ejecutar `py -m http.server 5500` desde esta carpeta.
4. Abrir `http://localhost:5500/#ajustes` y actualizar con Ctrl+Shift+R.
5. Revisar el catálogo y entrar a Ventas → Nueva venta / Tomar pedido. No registrar una venta de prueba real.

La sincronización del catálogo ocurre al iniciar sesión; cada equipo necesita refrescar la página para obtener precios actualizados. No se requiere instalar nuevamente las migraciones 07–12.
