# Sólo para Supabase LOCAL; nunca apunta a producción ni a conexiones remotas.
param([string]$LocalDatabaseUrl = $env:PLEBES_LOCAL_DATABASE_URL)
$ErrorActionPreference = 'Stop'
if (-not $LocalDatabaseUrl) { throw 'Configura PLEBES_LOCAL_DATABASE_URL con una URL de PostgreSQL local (127.0.0.1/localhost).' }
try { $target = [uri]$LocalDatabaseUrl } catch { throw 'URL de conexión local inválida.' }
if ($target.Scheme -notin @('postgres', 'postgresql') -or $target.Host -notin @('127.0.0.1','localhost','::1')) {
  throw 'Protección activada: este script sólo permite PostgreSQL local. No ejecuta SQL contra producción o ramas remotas.'
}
if (-not (Get-Command psql -ErrorAction SilentlyContinue)) { throw 'No se encontró psql. Instala las herramientas de PostgreSQL y repite en un entorno local aislado.' }
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$files = @(
 'sql/tests/PRECHECK_ISOLATED_BASE.sql',
 'sql/14_BRANCH_DELIVERIES_REVIEW.sql',
 'sql/tests/14_BRANCH_DELIVERIES_ISOLATED.sql',
 'sql/15_BRANCH_DELIVERY_RECEIPTS_REVIEW.sql',
 'sql/tests/15_BRANCH_DELIVERIES_ISOLATED.sql',
 'sql/16_RECIPES_AND_COSTS_REVIEW.sql',
 'sql/tests/16_RECIPES_SCHEMA_ISOLATED.sql',
 'sql/17_PARTIAL_PURCHASE_RECEIPTS_REVIEW.sql',
 'sql/tests/17_PARTIAL_PURCHASE_RECEIPTS_ISOLATED.sql'
)
foreach ($file in $files) {
  Write-Host "Validando archivo: $file"
  & psql -X --set=ON_ERROR_STOP=1 --dbname $LocalDatabaseUrl --file (Join-Path $root $file)
  if ($LASTEXITCODE -ne 0) { throw "Prueba detenida en $file. No continuar ni desplegar." }
}
Write-Host 'Todos los scripts terminaron sin errores. Falta probar concurrencia en sesiones paralelas y autorización de despliegue.'
