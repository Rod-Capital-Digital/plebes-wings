# Cómo integrar la revisión corregida V3 en VS Code

## Qué descargar

- **Parche V3:** archivos modificados, más documentación e instrucciones; recomendado para aplicar sobre el repositorio actual de la oficina.
- **Portal V3 completo:** copia independiente de todos los archivos del paquete recibido, con las mismas correcciones; recomendado para explorar o comparar sin sobrescribir tu trabajo.

## Integración del parche (oficina)

1. Abre la carpeta `C:\Users\DDE - UE\Downloads\Plebes_Wings_Portal_V1` en VS Code.
2. **Haz una copia de la carpeta completa en otro directorio.** Los archivos `app.js`, `sales-integration.js`, `index.html` y la migración se sobrescribirán al copiar el parche.
3. Extrae el ZIP del parche. Copia las carpetas y archivos a la raíz del proyecto **conservando su estructura**. No copies las carpetas dentro de una subcarpeta nueva.
4. Desde Git Bash, ya dentro de `Plebes_Wings_Portal_V1`, ejecuta:

   ```sh
   git status --short
   git diff --check
   node --check app.js
   node --check sales-integration.js
   node --test tests/*.test.mjs
   ```

5. El resultado esperado de la suite corregida es **46 pruebas aprobadas**. Las advertencias de LF/CRLF de Windows no son fallos de tests.
6. Revisa `AUDITORIA_V3_RESULTADO.md` y `docs/V3_SEGURIDAD_Y_MATRIZ_DE_PERMISOS.md`.

## ¡No ejecutar todavía!

- No ejecutes `sql/06_MULTIROl_ANULACION_SEGURA_PREPARADA.sql` en producción.
- No publiques el frontend V3 como POS operativo hasta desplegar su RPC en staging y aprobar pruebas por rol.
- No generes tickets de prueba en producción y no hagas `git push` antes de revisar el diff.
- No crees empleados reales para probar. Usa cuentas de pruebas en una instancia de staging.

La migración contiene un `BEGIN`/`COMMIT`; al aplicarse en staging realizará una actualización limitada para marcar anulaciones históricas con `void_legacy=true`, pero **no cambia valores de usuario ni de fecha históricos**.
