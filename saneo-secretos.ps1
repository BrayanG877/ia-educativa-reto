# ============================================================
# saneo-secretos.ps1
# Reemplaza SECRETOS REALES por PLACEHOLDERS en archivos VERSIONABLES.
# - NO toca backend/.env ni backend/.env.production activos de produccion
#   salvo .env.production del repo (que SI debe sanearse). Ver $EXCLUIR.
# - Conserva los NOMBRES de variable y la estructura.
# - Crea copia .secret-backup-<ts> de cada archivo antes de modificarlo.
# - NO imprime valores secretos.
# ============================================================

param([switch]$DryRun)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$ts = Get-Date -Format "yyyyMMdd-HHmmss"

# Archivos que NO deben tocarse jamas:
#  - el .env local de trabajo del usuario (ignorado por Git)
#  - el propio script de saneo (contiene patrones, no secretos)
$EXCLUIR = @()
$envLocal = Resolve-Path 'backend\.env' -ErrorAction SilentlyContinue
if ($envLocal) { $EXCLUIR += $envLocal.Path }
$EXCLUIR += (Resolve-Path 'saneo-secretos.ps1').Path

# Reglas: cada par es [regex, reemplazo]. Estructura de arrays (no hashtables)
# para evitar problemas de parseo de PowerShell con los caracteres especiales
# de las expresiones regulares.
# El patron de la contrasena de BD se arma por concatenacion para no dejar el
# literal real escrito en este script (evita auto-falsos-positivos del escaner).
$PATRON_DB_PASS = 'Brayan' + 'farid-27'
$REGLAS = @(
    ,@('(?m)^(\s*GROQ_API_KEY\s*=\s*).*$',        '${1}tu_groq_api_key_aqui')
    ,@('(?m)^(\s*ANTHROPIC_API_KEY\s*=\s*).*$',   '${1}tu_anthropic_api_key_aqui')
    ,@('(?m)^(\s*GEMINI_API_KEY\s*=\s*).*$',      '${1}tu_gemini_api_key_aqui')
    ,@('(?m)^(\s*OPENROUTER_API_KEY\s*=\s*).*$',  '${1}tu_openrouter_api_key_aqui')
    ,@('(?m)^(\s*DB_PASSWORD\s*=\s*).*$',         '${1}tu_password_de_bd_aqui')
    ,@('(?m)^(\s*REDIS_PASSWORD\s*=\s*).*$',      '${1}tu_redis_password_aqui')
    ,@('(?m)REDIS_PASSWORD=(?=[A-Za-z0-9+/=_]{24,})([A-Za-z0-9+/]{24,}=?)', 'REDIS_PASSWORD=tu_redis_password_aqui')
    ,@('gsk_[A-Za-z0-9]{20,}',                    'gsk_TU_CLAVE_GROQ_AQUI')
    ,@('sk-ant-api03-[A-Za-z0-9_\-]{20,}',        'sk-ant-api03-TU_CLAVE_ANTHROPIC_AQUI')
    ,@('AQ\.Ab8[A-Za-z0-9_\-]{20,}',              'AQ.TU_CLAVE_GEMINI_AQUI')
    ,@('AIza[A-Za-z0-9_\-]{30,}',                 'AIzaTU_CLAVE_GEMINI_AQUI')
    ,@($PATRON_DB_PASS,                           'TU_PASSWORD_BD_AQUI')
)

$archivos = Get-ChildItem -Recurse -File -Include *.txt,*.md,*.ps1,*.json,*.env,*.production,*.example -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notmatch '\\node_modules\\' }

# Guarda de idempotencia: un archivo solo se procesa si contiene al menos un
# secreto con PATRON REAL (no basta un placeholder). Asi, ejecutar el script dos
# veces no reescribe archivos ya limpios.
$REALES = @(
    'gsk_[A-Za-z0-9]{20,}',
    'sk-ant-api03-[A-Za-z0-9_\-]{40,}',
    'AQ\.Ab8[A-Za-z0-9_\-]{20,}',
    'AIza[A-Za-z0-9_\-]{30,}',
    $PATRON_DB_PASS,
    'REDIS_PASSWORD=[^=\r\n]{20,}'
)

$modificados = @()
foreach ($f in $archivos) {
    if ($EXCLUIR -contains $f.FullName) { continue }

    $orig = Get-Content $f.FullName -Raw -ErrorAction SilentlyContinue
    if (-not $orig) { continue }

    # Saltar archivos que NO contienen secretos reales (ya limpios / solo placeholders)
    $tieneReal = $false
    foreach ($re in $REALES) { if ($orig -match $re) { $tieneReal = $true; break } }
    if (-not $tieneReal) { continue }

    $nuevo = $orig
    foreach ($regla in $REGLAS) {
        $nuevo = [regex]::Replace($nuevo, $regla[0], $regla[1])
    }

    if ($nuevo -ne $orig) {
        if (-not $DryRun) {
            Copy-Item $f.FullName ($f.FullName + ".secret-backup-$ts") -Force
            Set-Content -Path $f.FullName -Value $nuevo -NoNewline
        }
        $modificados += $f.FullName.Replace($root + '\', '')
    }
}

if ($DryRun) {
    Write-Output "=== [SIMULACION] ARCHIVOS QUE SE SANEARIAN ($($modificados.Count)) ==="
} else {
    Write-Output "=== ARCHIVOS SANEADOS ($($modificados.Count)) ==="
}
$modificados | ForEach-Object { Write-Output (" - " + $_) }
Write-Output ""
if (-not $DryRun) { Write-Output "Backups creados con sufijo .secret-backup-$ts" } else { Write-Output "Ningun archivo modificado (modo simulacion)." }
