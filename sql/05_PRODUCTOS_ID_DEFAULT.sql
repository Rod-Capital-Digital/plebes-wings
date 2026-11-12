-- Plebes Wings · APLICADO al proyecto plebes-wings-prod el 10-nov-2026.
-- pw_products.id es texto requerido sin valor predeterminado en el esquema original.
-- Este valor por omisión permite que «Añadir presentación» reciba ID asignado por el servidor.
-- Las IDs existentes permanecen sin cambios.
ALTER TABLE public.pw_products ALTER COLUMN id SET DEFAULT (gen_random_uuid()::text);
