# MANIFIESTO DE CAMBIOS — Auditoría preoperativa 12/11/2026

Paquete de origen: `PLEBES_WINGS_V2_REVISADO_2026-11-12(1).zip`. Los archivos no listados se conservaron sin cambios respecto al ZIP recibido.

## Archivos añadidos o modificados

- **MODIFICADO** — `IMPLEMENTATION_STATUS.md`
- **NUEVO** — `PLAN_PUESTA_OPERACION_V2.md`
- **MODIFICADO** — `README.md`
- **MODIFICADO** — `purchases-integration.js`
- **MODIFICADO** — `sql/15_BRANCH_DELIVERY_RECEIPTS_REVIEW.sql`
- **MODIFICADO** — `sql/16_RECIPES_AND_COSTS_REVIEW.sql`
- **MODIFICADO** — `sql/tests/14_BRANCH_DELIVERIES_ISOLATED.sql`
- **NUEVO** — `sql/tests/15_BRANCH_DELIVERIES_ISOLATED.sql`
- **NUEVO** — `sql/tests/16_RECIPES_SCHEMA_ISOLATED.sql`
- **NUEVO** — `sql/tests/17_PARTIAL_PURCHASE_RECEIPTS_ISOLATED.sql`
- **NUEVO** — `sql/tests/PRECHECK_ISOLATED_BASE.sql`
- **NUEVO** — `tests/migration-readiness.test.mjs`
- **MODIFICADO** — `tests/purchases-integration.test.mjs`
- **NUEVO** — `tools/test-sql-local.ps1`

**Archivos originales eliminados:** 0.

## Verificación

- JS: 122/122 pruebas Node aprobadas.
- Sintaxis JS de módulos principales: correcta.
- Pruebas PostgreSQL 14–17: preparadas, NO ejecutadas (sin PostgreSQL local).
- Metadatos de producción consultados en modo lectura; no se aplicó SQL, no hubo escrituras ni commits.
- La validación real de concurrencia y permisos con JWT sigue pendiente.

Consulta `PLAN_PUESTA_OPERACION_V2.md` y `IMPLEMENTATION_STATUS.md` para el plan de puesta en operación.
