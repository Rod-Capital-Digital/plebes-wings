# Plebes Wings V3 — Acta técnica de despliegue

**Fecha:** 2026-11-11 (America/Mexico_City)

**Proyecto:** `plebes-wings-prod` (`rilrfcmmylldftioapnc`)

**Migración:** `20261111172140_plebes_v3_multirol_ventas_y_anulacion_segura`

**Archivo de origen:** `sql/06_MULTIROl_ANULACION_SEGURA_PREPARADA.sql`

**SHA-256 del archivo aplicado:** `044206ad5f72f8f71c755c3f179873b55aaa08431ab374a0a6b9599881a05ee3`

## Resultado

- Migración aplicada satisfactoriamente en producción mediante Supabase, con un único bloque transaccional.
- `public.pw_register_sale_v2(p_request jsonb)` disponible para `authenticated`; no ejecutable por `anon`.
- `public.pw_void_sale_v1(p_sale_id uuid, p_reason text)` disponible para `authenticated`; no ejecutable por `anon`.
- `public.pw_register_sale_v1` conserva firma e invoca V2.
- Escrituras directas de `authenticated` sobre `pw_sales`, `pw_sale_lines`, `pw_sale_payments` y `pw_audit_events`: `INSERT`, `UPDATE` y `DELETE` revocados. Permanece `SELECT` bajo RLS.
- Política de lectura de ventas por sucursal conservada; RLS sigue activo.
- Ticket preexistente anulado conservado con `void_legacy=true`, sin inventar actor ni fecha de anulación.
- Conteos posteriores: 1 venta histórica (0 activas, 1 anulada), 2 partidas, 1 pago.
- 46/46 pruebas locales Node aprobadas. Se notificó a PostgREST la recarga de esquema.

## Advertencias y pendientes

- **No se creó ni verificó un respaldo completo recuperable**. El usuario solicitó explícitamente avanzar sin entorno de pruebas pese a conocer el riesgo.
- **No se ejecutaron pruebas end-to-end con JWT auténticos de empleados**. Actualmente no hay membresías activas de empleado; existe una de `consultant`.
- El Security Advisor emitió alertas para dos funciones `SECURITY DEFINER` expuestas a `authenticated`. Su exposición es intencional como RPC; cada función valida explícitamente identidad y membresía, pero deben seguir auditándose. Referencia: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- Continúa deshabilitada la protección contra contraseñas filtradas: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
- No se registró ninguna venta nueva, no se anuló ninguna venta adicional ni se crearon cuentas durante esta intervención.

## Próximos pasos

1. Actualizar el portal local con Ctrl+F5, iniciar sesión como administrador y comprobar que desapareció `Could not find the function public.pw_register_sale_v2`.
2. Validar el diagnóstico del módulo de ventas y las acciones sin generar tickets ficticios.
3. Crear cuentas reales de empleados con membresía activa y sucursal asignada, bajo supervisión, y probar el aislamiento por sucursal y la denegación de anulación mediante sesiones reales antes de darles acceso operativo.
4. Generar un respaldo recuperable y configurar políticas de protección de contraseñas.
5. No volver a ejecutar la migración aplicada.
