# ACTUALIZACIÓN VIGENTE — 11/11/2026

Las migraciones **08–12 ya están aplicadas** en `plebes-wings-prod`. El resto de este archivo corresponde al diagnóstico histórico previo al despliegue, no al estado vigente. Consultar `ESTADO_DESPLIEGUE_08_12.md` para el informe actualizado.

---

# Estado de esta entrega actualizada — 2026-11-11

Este documento original describe la auditoría previa. La entrega actual incluye el código frontend y las migraciones preparadas en `sql/08_...` a `sql/12_...`, pero **ninguna se ha aplicado a producción**, y el sistema seguirá mostrando módulos bloqueados hasta su despliegue. Para instrucciones actualizadas, ver `ENTREGA_ACTUALIZACION.md`.

---

# Plebes Wings — estado de implementación

Fecha de auditoría: 2026-11-11 (America/Mexico_City)  
Proyecto verificado: `plebes-wings-prod` (`rilrfcmmylldftioapnc`)  
Motor: PostgreSQL 17.11.0.018

## Regla de despliegue

**No se ha aplicado ninguna migración ni modificación a producción durante esta auditoría.**

El despliegue queda bloqueado hasta contar con un respaldo recuperable y verificado del esquema y datos afectados. El entorno de trabajo tiene acceso MCP de lectura/escritura a Supabase, pero no tiene Supabase CLI, `pg_dump`, `psql` ni Docker, por lo que no puede generar ni restaurar una copia verificable de producción. No se crearán proyectos ni ramas de pago.

## Evidencia de estado remoto

- La migración `operational_catalogs_and_locations_07` figura instalada (`20261112001252`).
- La migración 08 no figura instalada.
- `pw_stock_locations` contiene exactamente `central`, `mora` y `santacruz`, activas.
- Registros reales actuales: 0 en compras, lotes, entregas, existencias iniciales, conteos, mermas, cortes, gastos, costos, proveedores, artículos de inventario, ventas, líneas y pagos. Hay 4 productos, 2 sucursales y 3 ubicaciones.
- Membresías activas: 1 `consultant`, 1 `employee`; **0 `owner`**. No se creó ni modificó ninguna membresía.

## Hallazgos que bloquean fases operativas

| Severidad | Hallazgo | Impacto / acción requerida |
| --- | --- | --- |
| Crítico | No hay respaldo recuperable comprobado antes de DDL. | No aplicar 08 ni migraciones posteriores hasta que un operador autorizado genere y pruebe restauración de un respaldo. |
| Crítico | No hay `owner` activo. | Operaciones que requieren aprobación o anulación de propietario no pueden operar con el modelo objetivo. Un propietario autorizado debe activar/asignar la membresía por procedimiento administrativo aprobado. |
| Alto | `pw_suppliers` y `pw_inventory_items` están vacías. | No es posible crear compras reales hasta que un responsable capture catálogos verdaderos. No se inventarán datos. |
| Alto | Las tablas legadas de entrega, inventario, merma, gastos y cortes otorgan `INSERT` directo a `authenticated`; los controles sensibles aún no son RPC obligatorias. | Reemplazar gradualmente por rutas transaccionales y revocar escrituras directas solo en una migración revisada y respaldada. |
| Alto | `#inventario`, `#caja` y `#finanzas` conservan cálculos y visualización desde `localStorage`. | No deben presentarse como fuente empresarial; requieren sus fases de libro de movimientos, caja y finanzas. |
| Medio | El asesor de Supabase informa dos RPC `SECURITY DEFINER` de ventas expuestas a `authenticated`. | Son RPC intencionales y verificadas internamente; no se modificaron para no arriesgar ventas. Mantener vigilancia y ejecutar el asesor después de cada migración. |
| Medio | La protección de contraseñas filtradas está desactivada en Supabase Auth. | Activación manual recomendada desde Auth settings; no es una migración de datos. |

## Estado por módulo

| Módulo | Estado | Evidencia |
| --- | --- | --- |
| Ventas y comandas | OPERATIVO | `pw_register_sale_v2` y `pw_void_sale_v1` existentes; tablas de ventas sin registros de prueba. Sin cambios en esta fase. |
| Compras y recepción | PARCIAL | Migración 08, RPC y UI preparados localmente; no desplegados. Catálogos requeridos vacíos. |
| Entregas entre ubicaciones | BLOQUEADO | Tabla legada existente sin movimientos; aún no tiene modelo de libro de inventario ni RPC controlada. |
| Inventario y mermas | BLOQUEADO | Tablas legadas existen, pero no hay libro transaccional ni integración segura de ventas/recepciones. UI usa historial local. |
| Corte de caja | BLOQUEADO | Tabla legada existe, sin movimientos ni sesiones de caja; UI calcula desde estado local. |
| Gastos y finanzas | BLOQUEADO | Tablas legadas existen, sin gastos/costos; no hay modelo de movimientos de efectivo ni reportes contables. |
| Catálogos operativos | PARCIAL | Migración 07 aplicada y ubicaciones validadas; faltan proveedores e insumos reales. |

## Próxima acción manual exacta

Un administrador del proyecto debe generar un respaldo verificable de `plebes-wings-prod` desde un equipo seguro con Supabase CLI o `pg_dump`, restaurarlo en un entorno local ya autorizado y documentar que se puede consultar la restauración. Después debe proporcionar la evidencia o habilitar una ruta de respaldo aprobada. No se requieren ni se deben compartir contraseñas, claves `service_role` ni secretos del proyecto en este repositorio o frontend.
