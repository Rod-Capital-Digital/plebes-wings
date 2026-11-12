-- Plebes Wings: menú de venta confirmado 11-nov-2026.
-- HISTÓRICO: este script ya fue ejecutado en plebes-wings-prod el 11-nov-2026.
-- No ejecutar otra vez en producción sin revisar las ediciones posteriores de precios.
-- No actualiza pw_inventory_items, recetas, existencias o costos.
BEGIN;
UPDATE public.pw_products SET sale_price=130,detail='Alitas en salsa al gusto, acompañadas de ensalada y papas. Gramaje por aclarar.',unit='porción',active=true,updated_at=now() WHERE id='ali';
UPDATE public.pw_products SET sale_price=130,detail='Pechuga de pollo en trozos, salsa al gusto y papas. Gramaje por aclarar.',unit='porción',active=true,updated_at=now() WHERE id='bon';
UPDATE public.pw_products SET active=false,updated_at=now() WHERE id IN ('ham','pap');
INSERT INTO public.pw_products(id,name,unit,sale_price,detail) VALUES
  ('pw_burger_sirloin_200', 'Hamburguesa Sirloin', 'pieza', 130, 'Carne sirloin 200 g; queso, piña, jitomate, lechuga y cebolla. Incluye papas.'),
  ('pw_burger_arrachera_200', 'Hamburguesa Arrachera', 'pieza', 130, 'Carne de arrachera 200 g; queso, piña, jitomate, lechuga y cebolla. Incluye papas.'),
  ('pw_burger_pollo_sencilla_120', 'Hamburguesa de pollo sencilla', 'pieza', 80, 'Pollo 120 g; jitomate, lechuga y cebolla. Incluye papas.'),
  ('pw_burger_pollo_doble_200', 'Hamburguesa de pollo doble', 'pieza', 110, 'Pollo 200 g; jitomate, lechuga y cebolla. Incluye papas.'),
  ('pw_burger_pollo_pepperoni_200', 'Hamburguesa de pollo especial Pepperoni', 'pieza', 140, 'Especial 200 g; jitomate, lechuga y pepperoni. Incluye papas.'),
  ('pw_burger_pollo_hawaiana_200', 'Hamburguesa de pollo especial Hawaiana', 'pieza', 140, 'Especial 200 g; jitomate, lechuga, piña y cebolla. Incluye papas.'),
  ('pw_hotdog_sencillo', 'Hot dog sencillo', 'pieza', 60, 'Jitomate, cebolla y chiles. Incluye papas.'),
  ('pw_hotdog_especial_120', 'Hot dog especial', 'pieza', 70, 'Especial 120 g; tocino, jitomate, cebolla y chiles. Incluye papas.'),
  ('pw_nachos_200', 'Nachos', 'porción', 100, 'Nachos 200 g con carne y aderezos. Incluye papas según menú.'),
  ('pw_papas_chicas_125', 'Papas a la francesa chicas', 'porción', 35, 'Porción de 125 g.'),
  ('pw_papas_medianas_200', 'Papas a la francesa medianas', 'porción', 60, 'Porción de 200 g.'),
  ('pw_papas_grandes_300', 'Papas a la francesa grandes', 'porción', 100, 'Porción de 300 g.'),
  ('pw_refresco', 'Refresco', 'unidad', 30, 'Presentación pendiente de confirmar.'),
  ('pw_bebida_sabor_500', 'Bebida de sabor medio litro', 'vaso', 25, '500 ml. Sabor a elegir.'),
  ('pw_bebida_sabor_1000', 'Bebida de sabor un litro', 'vaso', 50, '1,000 ml. Sabor a elegir.'),
  ('pw_jarra_agua_refill', 'Jarra de agua (refill)', 'jarra', 100, 'Capacidad pendiente de confirmar.')
ON CONFLICT(id) DO UPDATE SET name=excluded.name,unit=excluded.unit,sale_price=excluded.sale_price,detail=excluded.detail,active=true,updated_at=now();
COMMIT;
