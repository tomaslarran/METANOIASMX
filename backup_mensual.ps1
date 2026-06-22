# Backup mensual Metanoia SMX
# Exporta todas las tablas a JSON en C:\Users\admin\OneDrive\Metanoia\backups\
# Retiene los últimos 6 meses.

$backupDir = "C:\Users\admin\OneDrive\Metanoia\backups"
if (!(Test-Path $backupDir)) { New-Item -ItemType Directory -Force $backupDir | Out-Null }

$fecha = Get-Date -Format "yyyy-MM-dd"
$backupFile = "$backupDir\metanoia_backup_$fecha.json"

$tablas = @(
  "usuarios","tareas","cursos","inscripciones","alumnos","instructores",
  "cf_conceptos","cf_valores","cf_cobranzas","cf_prestamos","cf_inversiones",
  "cf_empleados","cf_pagos_empleados","banco_movimientos","caja_movimientos",
  "comprobantes_compra","cuenta_corriente","proveedores","inventario",
  "reuniones","publicaciones","rendimientos_diarios","autonomos_cuotas",
  "impuestos_ingresos","impuestos_declaraciones","notificaciones_config"
)

$ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpwcHhtZHZkZHZic3Z5bW9ndmNwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyMjcyODAsImV4cCI6MjA5MDgwMzI4MH0.KPAqCKfUteE3XK9QFqb_44Hm8jYQxfjVLkrlyGvaMhE"
$BASE_URL = "https://jppxmdvddvbsvymogvcp.supabase.co/rest/v1"

Write-Host "Iniciando backup Metanoia SMX - $fecha" -ForegroundColor Cyan

$backup = @{ fecha = $fecha; tablas = @{} }
$totalRows = 0

foreach ($tabla in $tablas) {
  try {
    $headers = @{ "apikey" = $ANON; "Authorization" = "Bearer $ANON" }
    $resp = Invoke-RestMethod -Uri "$BASE_URL/${tabla}?select=*&limit=10000" -Headers $headers -Method Get
    $count = if ($resp -is [array]) { $resp.Count } else { 1 }
    $backup.tablas[$tabla] = $resp
    $totalRows += $count
    Write-Host "  v $tabla ($count registros)" -ForegroundColor Green
  } catch {
    Write-Host "  x $tabla - $_" -ForegroundColor Red
    $backup.tablas[$tabla] = @()
  }
}

$backup | ConvertTo-Json -Depth 10 | Out-File -FilePath $backupFile -Encoding utf8
$sizeMB = [math]::Round((Get-Item $backupFile).Length / 1MB, 2)

Write-Host ""
Write-Host "Backup guardado: $backupFile ($sizeMB MB, $totalRows registros)" -ForegroundColor Cyan

# Eliminar backups de más de 6 meses
Get-ChildItem $backupDir -Filter "metanoia_backup_*.json" |
  Where-Object { $_.LastWriteTime -lt (Get-Date).AddMonths(-6) } |
  ForEach-Object { Remove-Item $_.FullName; Write-Host "Eliminado: $($_.Name)" -ForegroundColor Yellow }
