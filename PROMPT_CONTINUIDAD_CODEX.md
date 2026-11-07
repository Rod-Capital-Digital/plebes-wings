# Continuidad técnica para Codex — Plebes Wings

## Situación

La carpeta contiene un sitio estático, HTML/CSS/JS, con identidad visual y módulos piloto. Ninguna operación se sincroniza: los datos se guardan en localStorage. La documentación legal es una matriz de trabajo, no contratos firmados. Hay cuatro productos iniciales sin precios. Dos puntos de venta: Entrada de La Mora y Centro de Santa Cruz, Toluca. Atención 19:00–23:00. Compras y condimentación central por los dueños. Primera contratación prevista: un empleado que instala, prepara producto final, cobra y cierra.

## Próxima evolución propuesta

1. Conservar diseño, logo, navegación, responsive y flujos actuales.
2. Separar **vista del propietario** y **vista del operador**. No usar controles solo del frontend para proteger información.
3. Conectar un proyecto Supabase dedicado a Plebes Wings, previamente autorizado. No reutilizar un proyecto existente de otra organización.
4. Crear tablas y migraciones para sucursales, perfiles, productos, ventas/tickets, líneas de venta, pagos (incluyendo mixtos), compras, entregas con lotes, mermas, gastos, cortes de caja, inventario de apertura, ajustes auditados, tareas y documentos.
5. Habilitar Auth y políticas RLS que restrinjan operadores a su sucursal; propietarios pueden consultar ambas. Configurar secretos en variables de entorno no publicadas.
6. Almacenar documentos privados con permisos y URLs temporales; nunca publicar recetas maestras o datos personales sin autorización.
7. Validar integridad de pagos, turnos, periodos, negativos de stock y trazabilidad de anulación en el backend.
8. Crear modo consultoría con avances del proyecto y evidencias de tareas; los dueños deben ver actualizaciones en tiempo real en dispositivos distintos.
9. Preparar pruebas automáticas y manuales con casos de efectivo, tarjeta, transferencia, pago mixto, merma, gasto desde caja, arqueo, anulación, stock inicial, movimientos entre sucursales, usuarios por perfil y recuperación de datos.
10. Documentar despliegue, controles sanitarios, retención de registros y respaldos.

## Condiciones obligatorias

- No inventar precios, ventas, costos, permisos, fechas ni proveedores específicos.
- No presentar ganancias netas hasta configurar y validar costos reales.
- No implementar cláusula general de no competencia por 2 años como si fuese exigible; proteger secretos industriales con revisión profesional.
- No registrar ni revelar las recetas secretas, ingredientes en proporciones o contraseñas.
- No afirmar cumplimiento legal ni sanitario sin evidencias y revisión de la autoridad o profesional competente.
- No reemplazar el diseño original sin solicitarlo.
