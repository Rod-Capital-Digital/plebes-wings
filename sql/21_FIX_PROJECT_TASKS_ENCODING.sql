-- Corrige texto UTF-8 que fue interpretado con una codificación incorrecta al sembrar la Ruta.
BEGIN;

UPDATE public.pw_project_tasks AS task
SET phase = source.phase,
    title = source.title,
    description = source.description
FROM (VALUES
 ('diagnostico','01','Diagnóstico inicial y necesidades de ambos puestos','Registrar condiciones, ubicaciones, menú, abastecimiento y riesgos.'),
 ('menu','01','Definir catálogo, presentaciones y precios','Obtener precios y estandarizar tamaños/piezas por porción.'),
 ('existencias','01','Conteo físico y punto de partida','Registrar existencias iniciales reales de cada sucursal.'),
 ('compras','02','Trazabilidad de compras y proveedores','Registrar Central de Abastos, pollerías, cantidades y comprobantes.'),
 ('entregas','02','Control de producción y entregas','Separar preparación central, traslado y recepción por sucursal.'),
 ('caja','02','Registro de ventas y conciliación de caja','Registrar cada pedido y cotejar efectivo, tarjeta y transferencias.'),
 ('mermas','02','Inventario, mermas y cierres diarios','Comparar entradas, salidas, conteos físicos y faltantes.'),
 ('higiene','02','Protocolos de higiene y cadena de frío','Documentar prácticas y registros acordes a NOM-251.'),
 ('jornadas','02','Completar piloto de 14 jornadas','Validar el proceso con los propietarios antes de delegar.'),
 ('manual','03','Manual de apertura, preparación y cierre','Procedimiento replicable para operar el puesto sin exponer recetas.'),
 ('capacitacion','03','Capacitación y evaluación del primer empleado','Definir funciones, competencias, supervisión y evaluación.'),
 ('confidencialidad','03','Política de información reservada y confidencialidad','Identificar secretos, restringir acceso y solicitar revisión jurídica.'),
 ('contratacion','03','Paquete laboral y ruta de regularización','Contrato, privacidad, obligaciones patronales y permisos: revisión especializada.'),
 ('digital','04','Portal digital multiusuario y sincronización','Preparar backend, accesos diferenciados y seguridad de datos.'),
 ('indicadores','04','Tablero de ventas, costos y márgenes','Añadir utilidad real cuando se conozcan costos y porciones.')
) AS source(id,phase,title,description)
WHERE task.id = source.id;

COMMIT;
