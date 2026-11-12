# Contrato desplegado: ventas atómicas en `plebes-wings-prod`

RPC: `public.pw_register_sale_v1(p_request jsonb)` — resultado `{id, ticket, total, branch_id, replayed}`.

El frontend envía:

```json
{
  "request_id": "<uuid estable para un mismo intento>",
  "date": "2026-11-10",
  "branch_id": "mora",
  "items": [{"product_id": "<id de pw_products>", "quantity": 2, "quoted_unit_price": 99.9}],
  "payments": [{"method": "efectivo", "amount": 199.8}],
  "quoted_total": 199.8,
  "payment_reference": "",
  "note": ""
}
```

La función exige usuario autenticado con membresía activa `owner`/`consultant`, sucursal activa, productos activos, precios actuales autorizados, cantidades enteras, importes con dos decimales y suma de pagos exacta. Recalcula todo en PostgreSQL, genera folio y registra cabecera, partidas y pagos en una sola transacción. Un reintento idéntico con el mismo `request_id` retorna el mismo ticket; otro contenido con el mismo identificador se rechaza.

La RPC es `SECURITY INVOKER`, con `EXECUTE` exclusivo para `authenticated`; su seguridad usa las RLS existentes. El bucket documental `pw-internal-documents` es privado.

**Pendiente:** validación funcional con una sesión real y un ticket controlado; comprobación del flujo ante fallos intermitentes, ensayos con roles denegados, emisión física/digital de ticket, auditoría de cancelaciones y reconciliación de inventario. El portal no sustituye CFDI.
