# AUDITORÍA DE PUESTA EN OPERACIÓN — 12 DE NOVIEMBRE DE 2026 (NUEVA REVISIÓN)

**Estado: preparado para validación PostgreSQL aislada; NO apto todavía para desplegar.**

- **Origen:** `PLEBES_WINGS_V2_REVISADO_2026-11-12(1).zip`; la extracción no contiene `.git`, por tanto no hay historial Git verificable ni se hicieron commits.
- **Pruebas verificadas en esta sesión:** `node --test tests/*.test.mjs` = **122/122 aprobadas**; `node --check` de todos los JS del nivel raíz = sin errores. Estos resultados son sólo unitarios, contratos y mocks.
- **Supabase (read-only, sin modificar datos):** migraciones registradas hasta **12**, no 14–17; `pw_members` contiene **1 consultant y 1 employee activos, 0 owner activos**. Las tablas operativas de compras modernas, inventarios y ventas reportaron 0 filas en esta comprobación.
- **Entorno aislado:** no se encontró `psql`, PostgreSQL, Docker ni Supabase CLI; no se ejecutaron migraciones ni ensayos SQL, y no se creó ninguna rama con posible costo.
- **Migración 14:** corregido el caso de saldo insuficiente y la verificación de balance cero en `sql/tests/14_BRANCH_DELIVERIES_ISOLATED.sql`.
- **Migración 15:** se añadió guardia de movimientos `in_transit`, comprobación de saldo en tránsito en recepción y revocación a usuarios autenticados de las dos RPC antiguas de entrega directa de la 14. Se añadió `sql/tests/15_BRANCH_DELIVERIES_ISOLATED.sql`.
- **Migración 16:** se añadió índice único de receta activa por producto y `sql/tests/16_RECIPES_SCHEMA_ISOLATED.sql`. No se ha implementado consumo automático por venta.
- **Migración 17:** se conservan los controles de recibos parciales existentes y se agregó prueba transaccional `sql/tests/17_PARTIAL_PURCHASE_RECEIPTS_ISOLATED.sql`. En frontend se impide comprar hacia `in_transit` y convertir costo unitario vacío en costo cero.
- **Herramienta de pruebas:** `tools/test-sql-local.ps1` ejecuta la secuencia 14/test14 → 15/test15 → 16/test16 → 17/test17 sólo contra una URL local. Requiere un clon base compatible hasta 12.
- **Pruebas de concurrencia real, JWT/RLS y restauración:** **NO ejecutadas**. Las pruebas SQL son preparaciones, no resultados de ejecución. La certificación de caja, costos, recetarios y consumo por venta sigue pendiente.
- **Protocolo detallado:** `PLAN_PUESTA_OPERACION_V2.md` (prerrequisitos, riesgos, roles, pruebas, autorización, despliegue y recuperación).
- **Sin cambios en Supabase producción, GitHub ni los registros del negocio.**

---

# REVISIÓN ACTUAL DEL CÓDIGO — 12 DE NOVIEMBRE DE 2026

**Origen:** ZIP que proporcionó el propietario para revisión y reparación. Este encabezado es el estado más reciente del paquete entregado; las secciones inferiores son historial y pueden contener datos obsoletos. **No se modificó Supabase, no se desplegó SQL ni se hizo commit/push.**

## Correcciones verificadas en esta entrega

- `app.js` / `pos-draft.js`: se persiste y recupera la comanda local no cobrada por usuario, con caducidad de 72 horas y un identificador de solicitud estable. Se conserva sucursal, cantidades, papel, forma de pago prevista y notas; se omiten datos de tarjeta y referencias sensibles. Una venta de resultado incierto bloquea nuevas modificaciones hasta conciliación. La venta sólo se registra por la RPC oficial.
- `app.js`: se evita que la interfaz trate como instaladas las entregas pendientes por detectar solamente la migración 14. La preparación de entregas se ofrece cuando la comprobación de la migración 15 confirma el flujo; se corrige el acceso del empleado a la recepción de su propia sucursal, con defensa adicional por sucursal en el cliente (además de RLS en servidor).
- `app.js` / compras: los reintentos de borradores y recepciones usan el mismo `request_id` y no recrean operaciones si falla la conexión. En caso de error se congela la captura para no cambiar el contenido del reintento; la confirmación y actualización de historial se manejan por separado.
- `finance-metrics.js`: la cifra de compras recibidas usa las cantidades realmente aceptadas, no la totalidad de una orden parcialmente recibida. Cifras incompletas se identifican explícitamente; no constituyen utilidad fiscal.
- `recipes-integration.js`: una receta sin ingredientes o con costo `null` ya no aparece como producto de costo cero ni como margen confirmado.
- `purchases-integration.js`: validación de fechas reales y precios monetarios (sin errores por coma flotante) y límite de costo plausible.
- `sql/17_PARTIAL_PURCHASE_RECEIPTS_REVIEW.sql`: se eliminó una declaración de clave primaria duplicada; se corrigió la ambigüedad del identificador de recibo y se reforzaron controles de reintentos, autorización y cantidades antes de publicar el esquema en una base aislada.
- `sql/15_BRANCH_DELIVERY_RECEIPTS_REVIEW.sql`: se corrigió la comparación del hash de idempotencia y la repetición de una recepción ya concluida; se valida que la repetición del despacho corresponda a la misma entrega.

## Evidencia de pruebas

- `node --test tests/*.test.mjs`: **114/114 aprobadas**, 0 fallos en Node 22.16.0.
- `node --check`: sintaxis de los módulos JS del proyecto, correcta.
- Tipo de evidencia: pruebas locales unitarias/de contrato/mocks. **No constituye una prueba de integración SQL ni una certificación para operar dinero o inventario en producción.**

## Estado real de los módulos

| Componente | Estado verificable | Qué falta para usarlo íntegramente |
| --- | --- | --- |
| Ventas POS y comandas | Integración existente y recuperación local de borradores añadida | Pruebas con sesiones/ventas reales de cada rol y sucursal; conciliación de solicitudes inciertas |
| Inventario por ubicación | UI y ledger existentes | Inventario inicial físico, insumos reales, validación SQL en base aislada |
| Entregas / recepción parcial | Código UI/RPC preparado en archivos 14 y 15 | Validación de seguridad y concurrencia y despliegue autorizado en ese orden |
| Recetas/costos | Vista, conversiones y cálculo local con protección ante costos desconocidos | Despliegue y validación migración 16, captura real de recetas/costos, edición persistente y RPC venta-consumo atómica |
| Proveedores y compras | Interfaz/RPC existentes, recepciones parciales localmente preparadas | Validación migración 17, reconciliación de documentos antiguos y pruebas PostgreSQL |
| Caja y gastos | Frontend y RPC ya presentes | Pruebas de cierre real, conciliación, roles y métricas completas por sucursal |
| Bluetooth y agente IA | Fuera de alcance | Integrar una vez estabilizada y validada la plataforma |

## Bloqueos de publicación / operación

1. Migraciones **14, 15, 16 y 17 NO aplicadas ni probadas** en una copia aislada de PostgreSQL. No instalarlas en producción sin respaldo/restauración verificados, prueba de roles y plan de reversión.
2. Sin existencias iniciales, insumos, proveedores, gramajes/costos confirmados y recetas activas no es posible calcular consumo automático ni utilidad real.
3. Verificar si ya se activó una membresía `owner` genuina. La última evidencia del repositorio reportaba ninguna; no se ha inspeccionado la base en esta revisión.
4. Las pruebas JavaScript usan datos controlados; no se han completado ensayos end-to-end contra el proyecto productivo.
5. Conservar `.git` original al incorporar este ZIP; el paquete actualizado no lo contiene intencionalmente.

**Documento operacional de entrega:** `ENTREGA_REVISADA_2026-11-12.md`.

---

# ACTUALIZACIÓN VIGENTE — 12/11/2026

## Fase 2 — recetas, gramajes y costos (preparación local)

- Se añadió `sql/16_RECIPES_AND_COSTS_REVIEW.sql`, sin desplegar. Define historial de costos por insumo, versiones inmutables de recetas, partidas y la tabla de trazabilidad de consumo por venta con `request_id` único.
- Se añadió `recipes-integration.js`: conversión estricta `g ↔ kg` y `ml ↔ l`, validación de líneas, costo por rendimiento/merma y margen estimado. Una receta sin costo real queda marcada incompleta y no produce una utilidad inventada.
- Se añadió la pantalla **Recetas y costos** y el enlace de navegación. Lista los productos y sus precios oficiales sin alterarlos; deja explícito que no se guardan recetas ni se consumen existencias hasta desplegar y validar la migración.
- La integración automática con `pw_register_sale_v2` continúa deliberadamente deshabilitada. La migración sólo prepara la trazabilidad para una futura RPC coordinada y reversible, para no afectar ventas productivas.
- Pruebas nuevas en `tests/recipes-integration.test.mjs`; verificación actual: `node --check` y suite completa **96/96 aprobadas**.

## Implementación posterior de entregas pendientes

- Se añadió `sql/15_BRANCH_DELIVERY_RECEIPTS_REVIEW.sql` (revisión, sin desplegar). Depende de 14 y crea entrega, partidas y recepciones con RLS; introduce la ubicación contable `in_transit`.
- Regla implementada: crear borrador no mueve inventario; despachar mueve `central → in_transit`; cada recepción mueve sólo lo físicamente aceptado `in_transit → sucursal`. La diferencia permanece cuantificada en tránsito hasta una resolución posterior auditada.
- Se añadieron las RPC idempotentes `pw_create_branch_delivery_v1`, `pw_dispatch_branch_delivery_v1` y `pw_receive_branch_delivery_v1`, más el cliente `branch-deliveries-integration.js`. Todas las escrituras directas de las tablas nuevas están revocadas.
- La pantalla conserva el formulario de entrega y ahora lo condiciona a la migración 15; el guardado se dirige al flujo pendiente. Aún falta presentar la bandeja de despacho/recepción y sus formularios en la interfaz antes de uso operativo.
- Pruebas: `node --test tests/*.test.mjs` = **90/90 aprobadas**; el contrato nuevo está en `tests/pending-branch-deliveries.test.mjs`. Sigue pendiente ejecutar el SQL reversible en una base aislada y validar las políticas con JWT reales.

### Integración visual posterior

- Se completó la bandeja de entregas en Inventario: muestra destino, estado, responsable y cantidades **enviada / recibida / pendiente en tránsito**; permite filtrar por sucursal y estado.
- Un administrador puede despachar un borrador. El despacho se limita a la RPC y deja explícito que central se descuenta y tránsito se acredita.
- Un administrador o el empleado autorizado de la sucursal destino puede capturar una recepción parcial y observaciones. La interfaz precarga el pendiente real por partida y no permite que éste se acredite hasta confirmar la RPC.
- Verificación local posterior: `node --check app.js`, `node --check branch-deliveries-integration.js` y `node --test tests/*.test.mjs`: **91/91 aprobadas**.

## Revisión de continuidad — Fase 1

### Evidencia verificada

- Producción: las migraciones 07–12 constan como aplicadas en la evidencia local fechada el 11/11/2026. Esta revisión no ejecutó SQL, no consultó ni modificó datos de Supabase y no desplegó la migración 14.
- La migración `sql/14_BRANCH_DELIVERIES_REVIEW.sql` permanece preparada y sin autorizar. Su flujo es atómico, multirrenglón e idempotente para un **traspaso inmediato** de `central` a una sucursal, con reversión auditada e inventario negativo prevenido mediante bloqueos por artículo/ubicación.
- La 14 **no** implementa aún la entrega pendiente requerida para operación: no persiste estados `borrador/preparada/en tránsito/recibida/recibida con diferencias/anulada`, responsable de recepción, cantidades efectivamente recibidas ni diferencias. Por ello no debe presentarse como entrega diaria completa ni desplegarse sin una migración posterior revisada.
- Las operaciones de inventario, compras, caja y gastos usan RPC en el frontend actual; las recetas, consumo automático por venta, costos históricos por receta y persistencia de comandas de servidor siguen pendientes.

### Pruebas ejecutadas localmente

- `node --check` sobre `app.js`, ventas, compras, operaciones, catálogo y simulador: correcto.
- `node --test tests/*.test.mjs`: **87/87 aprobadas**, 0 fallos, en Node `v24.19.0`.
- Las pruebas son unitarias, de contrato y con mocks. El script SQL `sql/tests/14_BRANCH_DELIVERIES_ISOLATED.sql` inicia con `BEGIN` y termina con `ROLLBACK`, pero queda pendiente de ejecución en una base local o rama desechable.

### Bloqueos reales y siguiente acción

- Esta estación no tiene Supabase CLI, `psql` ni Docker disponibles; tampoco se debe usar producción como entorno de prueba.
- Antes de autorizar cualquier SQL nuevo: disponer de respaldo verificable y de un entorno aislado, ejecutar los scripts 09–12/14 y validar JWT reales de owner, consultant y ambos empleados.
- Siguiente acción de desarrollo segura: diseñar y revisar la migración de entregas pendientes/recepción por sucursal, integrada al libro actual sin alterar los movimientos históricos ni la migración 14.

### Estado del repositorio al iniciar esta revisión

- Rama `main`; remoto `origin` configurado. Ya existían cambios locales sin confirmar en `app.js`, `operations-integration.js`, `sales-integration.js`, `styles.css`, dos pruebas POS y los activos/módulos/migración 14 de inventario. Se preservaron; no hubo `commit` ni `push`.

---

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
