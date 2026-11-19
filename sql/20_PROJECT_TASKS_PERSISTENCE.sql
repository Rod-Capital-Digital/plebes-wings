-- La Ruta del proyecto deja de depender de localStorage: sus avances viven en Supabase.
BEGIN;

INSERT INTO public.pw_project_tasks(id,phase,title,description,status,note)
VALUES
 ('diagnostico','01','Diagnóstico inicial y necesidades de ambos puestos','Registrar condiciones, ubicaciones, menú, abastecimiento y riesgos.','Validado',''),
 ('menu','01','Definir catálogo, presentaciones y precios','Obtener precios y estandarizar tamaños/piezas por porción.','Pendiente',''),
 ('existencias','01','Conteo físico y punto de partida','Registrar existencias iniciales reales de cada sucursal.','Pendiente',''),
 ('compras','02','Trazabilidad de compras y proveedores','Registrar Central de Abastos, pollerías, cantidades y comprobantes.','Pendiente',''),
 ('entregas','02','Control de producción y entregas','Separar preparación central, traslado y recepción por sucursal.','Pendiente',''),
 ('caja','02','Registro de ventas y conciliación de caja','Registrar cada pedido y cotejar efectivo, tarjeta y transferencias.','Pendiente',''),
 ('mermas','02','Inventario, mermas y cierres diarios','Comparar entradas, salidas, conteos físicos y faltantes.','Pendiente',''),
 ('higiene','02','Protocolos de higiene y cadena de frío','Documentar prácticas y registros acordes a NOM-251.','Pendiente',''),
 ('jornadas','02','Completar piloto de 14 jornadas','Validar el proceso con los propietarios antes de delegar.','Pendiente',''),
 ('manual','03','Manual de apertura, preparación y cierre','Procedimiento replicable para operar el puesto sin exponer recetas.','Pendiente',''),
 ('capacitacion','03','Capacitación y evaluación del primer empleado','Definir funciones, competencias, supervisión y evaluación.','Pendiente',''),
 ('confidencialidad','03','Política de información reservada y confidencialidad','Identificar secretos, restringir acceso y solicitar revisión jurídica.','Pendiente',''),
 ('contratacion','03','Paquete laboral y ruta de regularización','Contrato, privacidad, obligaciones patronales y permisos: revisión especializada.','Pendiente',''),
 ('digital','04','Portal digital multiusuario y sincronización','Preparar backend, accesos diferenciados y seguridad de datos.','Pendiente',''),
 ('indicadores','04','Tablero de ventas, costos y márgenes','Añadir utilidad real cuando se conozcan costos y porciones.','Pendiente','')
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.pw_update_project_task_v1(p_task_id text,p_status text,p_note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE actor uuid := auth.uid(); updated public.pw_project_tasks%ROWTYPE;
BEGIN
  IF actor IS NULL OR NOT private.pw_is_manager() THEN RAISE EXCEPTION 'No autorizado para actualizar la Ruta del proyecto.'; END IF;
  IF btrim(coalesce(p_task_id,'')) = '' THEN RAISE EXCEPTION 'La tarea es obligatoria.'; END IF;
  IF p_status NOT IN ('Pendiente','En curso','Validado') THEN RAISE EXCEPTION 'Estado de tarea inválido.'; END IF;
  IF length(coalesce(p_note,'')) > 850 THEN RAISE EXCEPTION 'La nota no puede superar 850 caracteres.'; END IF;
  UPDATE public.pw_project_tasks SET status=p_status,note=btrim(coalesce(p_note,'')),updated_at=clock_timestamp() WHERE id=p_task_id RETURNING * INTO updated;
  IF NOT FOUND THEN RAISE EXCEPTION 'La tarea solicitada no existe.'; END IF;
  INSERT INTO public.pw_audit_events(user_id,module,action,entity_id,metadata) VALUES(actor,'project_route','task_updated',updated.id,jsonb_build_object('status',updated.status,'updated_at',updated.updated_at));
  RETURN jsonb_build_object('id',updated.id,'status',updated.status,'note',updated.note,'updated_at',updated.updated_at);
END;
$fn$;

REVOKE INSERT, UPDATE, DELETE ON public.pw_project_tasks FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pw_update_project_task_v1(text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pw_update_project_task_v1(text,text,text) TO authenticated;
COMMIT;
