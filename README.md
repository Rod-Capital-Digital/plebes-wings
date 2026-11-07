# Plebes Wings — Centro de Operaciones

**Primera versión · Portal de consultoría y piloto de control operativo**

Identidad visual basada en el logotipo entregado por Plebes Wings. Sitio en HTML, CSS y JavaScript sin dependencias externas. Diseñado para abrirse en computadora o celular y ser trabajado en Visual Studio Code / Codex.

## Contenido del portal

1. **Resumen general:** indicadores sin datos ficticios, progreso, ventas por sucursal, desglose de métodos de cobro y actividad reciente.
2. **Ruta del proyecto:** diagnóstico, 14 jornadas piloto, estandarización, gestión de personal, documentos, formalización y digitalización futura; cada tarea permite registrar estado y nota.
3. **Biblioteca de entregables:** documentos previstos con estado, nota y vínculo a archivo autorizado; no sube archivos directamente.
4. **Ventas:** ticket con múltiples productos y pago en efectivo, tarjeta, transferencia o mixto; histórico y anulación justificada.
5. **Compras y entregas:** recepción por sucursal, compras centralizadas, lotes, mermas y proveedores.
6. **Inventario:** conteo físico inicial, entregas, ventas y mermas; existencias teóricas por puesto.
7. **Corte de caja:** fondo, ventas en efectivo, salidas, retiros, arqueo, responsable y conteo físico.
8. **Gastos:** gastos clasificados por sucursal o producción central.
9. **Personal y protocolos:** descripción del puesto, separación de conocimientos, entrenamiento, higiene y ruta de revisión legal.
10. **Menú y configuración:** precios y presentaciones; respaldos en JSON, exportación CSV e importación de un respaldo.

## Abrir en VS Code

1. Descomprime `Plebes_Wings_Portal_V1.zip`.
2. Abre la carpeta `plebes-wings-portal` en **Visual Studio Code**.
3. Recomendado: usa la extensión **Live Server** y selecciona **Open with Live Server** en `index.html`.
4. La web se abrirá en `http://127.0.0.1:5500` o un puerto similar. No se requiere `npm install`.
5. También se puede abrir `index.html` con doble clic, pero para persistencia consistente y pruebas se recomienda Live Server.

## Primeros pasos del piloto

- Completar **Menú y configuración**: precios reales y unidades estándar por presentación. *No se cargaron precios ficticios.*
- En **Inventario**, capturar conteo físico inicial de ambas sucursales.
- Comenzar a registrar compras a proveedores, lotes/entregas recibidas, mermas, ventas y gastos.
- Registrar un **corte de caja** por sucursal al final de cada jornada. Ambas sucursales cerradas en la misma fecha cuentan como una jornada completa del piloto; objetivo 14 jornadas efectivas.
- Revisar desviaciones, faltantes, diferencias de caja, higiene y facilidad de uso del procedimiento.
- Mantener actualizado el **plan de trabajo** y asignar vínculos de consulta autorizados a la biblioteca documental.

## PRIVACIDAD, SINCRONIZACIÓN Y ALCANCE ACTUAL

**ESTE PORTAL NO ES TODAVÍA UN SISTEMA MULTIUSUARIO EN PRODUCCIÓN.**

- Los registros se guardan mediante `localStorage` **solo en el navegador y dispositivo donde se capturan**. Ni el propietario ni otro equipo verán cambios automáticamente.
- Abrir o publicar los archivos mediante GitHub Pages **NO** crea una base de datos ni sincroniza información. Sirve para visualizar la versión pública del sitio, pero no constituye una plataforma de operaciones compartida.
- La versión actual no tiene inicio de sesión, control real de permisos, almacenamiento de archivos, cifrado empresarial, registro de auditoría a nivel servidor ni respaldos automáticos.
- **No captures recetas secretas, fórmulas exactas, contraseñas, datos bancarios sensibles, documentos de identidad de empleados ni información empresarial que deba mantenerse privada.**
- Evita publicar cifras operativas reales en una web estática pública; antes debe incorporarse autenticación y protección de datos. Todos los documentos y enlaces deben estar autorizados y protegidos en el servicio donde se alojan.
- Exporta con frecuencia el JSON para respaldar la información. El CSV de ventas ayuda a revisar tickets, pero no es un respaldo completo.
- La página muestra *registros* y *efectivo esperado*; no sustituye un sistema contable, un punto de venta certificado ni un cálculo de impuestos, y no genera CFDI.
- Las existencias usan unidades estándar. No se puede inferir número de porciones a partir de kilos de insumo sin fichas técnicas de rendimiento y merma.
- La conciliación del ticket valida importes capturados, no confirma que realmente se haya recibido el depósito bancario. Esa comprobación debe hacerse por separado.

### Paso siguiente: plataforma compartida

Antes de que empleados comiencen a operar y los dueños supervisen a distancia, conectar un backend seguro (por ejemplo **Supabase**) con:

1. Autenticación y perfiles: propietarios/administración vs. operador por sucursal.
2. Base de datos para productos, ventas y pagos, lotes/entregas, compras, gastos, mermas, cortes y tareas.
3. Políticas de seguridad en base de datos (RLS), validaciones servidor y bitácora inmutable.
4. Almacenamiento privado y vínculos temporales para entregables y documentos sensibles.
5. Respaldos programados, monitoreo y publicación segura bajo un dominio controlado.
6. Pruebas de uso concurrente, seguridad, integridad y restauración antes del uso real.

### Protección legal y sanitaria

- Artículo 5 constitucional: libertad de trabajo, no asumir eficacia de una prohibición general de competencia de 2 años: https://museodelasconstituciones.unam.mx/articulo-5/
- Ley Federal del Trabajo, artículo 134 XIII: secretos técnicos, comerciales y de fabricación: https://www.diputados.gob.mx/LeyesBiblio/pdf/LFT.pdf
- Ley Federal de Protección a la Propiedad Industrial, artículos 163-166 (secretos industriales): https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPPI.pdf
- NOM-251-SSA1-2009 de higiene de alimentos: https://sidof.segob.gob.mx/notas/docFuente/5133449

Estas referencias son orientativas y no sustituyen una revisión profesional laboral, fiscal, municipal y sanitaria para la operación concreta de ambos puestos.

## Estructura de archivos

```
plebes-wings-portal/
├── index.html
├── styles.css
├── app.js
├── assets/
│   ├── plebes-background.jpg
│   └── plebes-logo.png
└── README.md
```

## Actualizaciones con Codex

Puedes pedir: “Revisa el proyecto Plebes Wings y conecta una base de datos Supabase nueva, con autenticación y políticas RLS por sucursal. Conserva la identidad visual y los módulos existentes. No publiques las recetas ni permitas acceso público a registros reales. Agrega migraciones, pruebas y un README de despliegue”.

**No conectar todavía a una instancia Supabase ya usada en otro proyecto** sin establecer un entorno y respaldo específicos para Plebes Wings.
