# ==================================================================
# pack-exclusions.ps1  —  REGLAS DE EMPAQUETADO SEGURO (Fase 5C.1)
# ==================================================================
# Módulo compartido por TODOS los scripts que generan ZIP o copias de
# despliegue. Define:
#   1) Los PATRONES PROHIBIDOS: nunca deben entrar en un paquete.
#   2) Los PATRONES PERMITIDOS pese a parecer prohibidos (plantillas .example).
#   3) Funciones para (a) filtrar rutas al copiar y (b) VALIDAR el ZIP final
#      antes de publicarlo, abortando si aparece un archivo prohibido.
#
# Uso (dot-source):
#     . "$PSScriptRoot\pack-exclusions.ps1"
#     $rutaRel = Get-RelativePathSafe -Base $origen -Full $archivo
#     if (-not (Test-RutaPermitida -RelativePath $rutaRel)) { continue }
#     ...
#     Assert-PaqueteLimpio -ZipPath $zip   # aborta si hay algo prohibido
#
# Este archivo NO lee ni imprime valores de secretos: solo compara NOMBRES
# de archivo/ruta. Es seguro versionarlo.
# ==================================================================

Set-StrictMode -Version Latest

# ------------------------------------------------------------------
# 1. PATRONES PROHIBIDOS (regex sobre la ruta RELATIVA con '/' como separador)
# ------------------------------------------------------------------
$script:PatronesProhibidos = @(
    # Variables de entorno y variantes (cualquier .env, .env.local, .env.production...)
    '(^|/)\.env$',
    '(^|/)\.env\.[^/]+$',
    # Respaldos de secretos y copias de seguridad
    '(^|/)\.backups(/|$)',
    '\.secret-backup-',
    '\.bak$',
    '\.bak-',
    # Respaldos de código con marca de fase/fecha (p. ej. ai.service.js.fase3-20261010-000716).
    # Antes NO se excluían: estas copias ANTIGUAS de ai.service.js y de otros
    # servicios entraban en el paquete y podían confundirse con la versión vigente.
    '\.fase\d+-[0-9]{8}-[0-9]{6}$',
    '\.(old|orig|copy)$',
    # Credenciales y configuración local
    '(^|/)ftp-credentials',
    '(^|/)variables-para-copiar',
    '(^|/)publish-credentials',
    '(^|/)\.publishsettings$',
    '(^|/)id_rsa',
    '\.pem$',
    '\.pfx$',
    '\.p12$',
    '(^|/)\.npmrc$',
    '(^|/)\.netrc$',
    # Dependencias y artefactos locales
    '(^|/)node_modules(/|$)',
    '(^|/)\.git(/|$)',
    '(^|/)\.gitignore$',
    '(^|/)\.dockerignore$',
    # Pruebas y cobertura
    '(^|/)test(/|$)',
    '\.test\.js$',
    '(^|/)coverage(/|$)',
    # Scripts/artefactos de prueba y utilidades LOCALES que no deben ir a
    # producción (herramientas de diagnóstico, seeds y pruebas manuales).
    '(^|/)test-[^/]*\.(js|ps1|sh|json)$',
    '(^|/)test_[^/]*\.(js|ps1|sh|json)$',
    '(^|/)check-[^/]*\.(js|ps1)$',
    '(^|/)check_[^/]*\.(js|ps1)$',
    '(^|/)create-[^/]*\.js$',
    '(^|/)create_[^/]*\.js$',
    '(^|/)reset-[^/]*\.js$',
    '(^|/)diagnostico-[^/]*\.js$',
    '(^|/)verificar-[^/]*\.(js|ps1)$',
    '(^|/)init-database\.js$',
    '(^|/)manual-schema-instructions\.js$',
    '(^|/)serve-web\.js$',
    # Logs y temporales
    '\.log$',
    '(^|/)logs(/|$)',
    '(^|/)npm-debug\.log',
    '(^|/)\.DS_Store$',
    '(^|/)Thumbs\.db$',
    '\.tmp$',
    '\.temp$',
    # Carpetas de trabajo del propio empaquetador
    '(^|/)deploy-extracted(/|$)',
    '(^|/)verify-zip(/|$)',
    '(^|/)deploy-check(/|$)',
    '(^|/)temp-deploy-clean(/|$)',
    # Otros paquetes comprimidos (evita anidar zips)
    '\.zip$'
)

# ------------------------------------------------------------------
# 2. PATRONES PERMITIDOS aunque casen con un prohibido.
#    Solo plantillas de ejemplo, que son seguras y deben viajar/documentarse.
# ------------------------------------------------------------------
$script:PatronesPermitidos = @(
    '(^|/)\.env\.example$',
    '(^|/)\.env\.production\.example$',
    '(^|/)\.env\.[^/]*\.example$',
    '(^|/)README\.md$'
)

function Get-RutaRelativaNormalizada {
    param(
        [Parameter(Mandatory=$true)][string]$Base,
        [Parameter(Mandatory=$true)][string]$Full
    )
    $baseNorm = ([System.IO.Path]::GetFullPath($Base)).TrimEnd('\','/')
    $fullNorm = [System.IO.Path]::GetFullPath($Full)
    if ($fullNorm.StartsWith($baseNorm, [System.StringComparison]::OrdinalIgnoreCase)) {
        $rel = $fullNorm.Substring($baseNorm.Length)
    } else {
        $rel = $fullNorm
    }
    $rel = $rel.TrimStart('\','/')
    # Normalizar separadores a '/' para que las regex sean uniformes.
    return ($rel -replace '\\','/')
}

function Test-RutaProhibida {
    <#
      Devuelve $true si la ruta RELATIVA (con '/' ) está PROHIBIDA.
      Las plantillas de ejemplo (.example) se consideran permitidas.
    #>
    param([Parameter(Mandatory=$true)][string]$RelativePath)

    $rel = ($RelativePath -replace '\\','/')

    foreach ($p in $script:PatronesPermitidos) {
        if ($rel -match $p) { return $false }
    }
    foreach ($p in $script:PatronesProhibidos) {
        if ($rel -match $p) { return $true }
    }
    return $false
}

function Test-RutaPermitida {
    param([Parameter(Mandatory=$true)][string]$RelativePath)
    return -not (Test-RutaProhibida -RelativePath $RelativePath)
}

function Get-MotivoProhibido {
    <# Devuelve el patrón que hace prohibida una ruta, o $null si es permitida. #>
    param([Parameter(Mandatory=$true)][string]$RelativePath)
    $rel = ($RelativePath -replace '\\','/')
    foreach ($p in $script:PatronesPermitidos) { if ($rel -match $p) { return $null } }
    foreach ($p in $script:PatronesProhibidos) { if ($rel -match $p) { return $p } }
    return $null
}

function Assert-PaqueteLimpio {
    <#
      VALIDACIÓN PREVIA A PUBLICACIÓN.
      Abre el ZIP en SOLO LECTURA, inspecciona los NOMBRES de entrada (nunca
      su contenido) y ABORTA (exit 1) si encuentra un archivo prohibido.
      No imprime valores de secretos; solo rutas y el motivo (patrón).
    #>
    param(
        [Parameter(Mandatory=$true)][string]$ZipPath
    )

    if (-not (Test-Path $ZipPath)) {
        Write-Host "[VALIDACION] ERROR: no existe el paquete: $ZipPath" -ForegroundColor Red
        exit 1
    }

    Add-Type -AssemblyName System.IO.Compression.FileSystem -ErrorAction SilentlyContinue

    $zip = $null
    try {
        $zip = [System.IO.Compression.ZipFile]::OpenRead((Resolve-Path $ZipPath).Path)
        $prohibidos = New-Object System.Collections.Generic.List[string]

        foreach ($entry in $zip.Entries) {
            $nombre = $entry.FullName
            if ([string]::IsNullOrEmpty($nombre)) { continue }
            # Ignorar entradas de DIRECTORIO puras (terminan en '/' o '\', o
            # tienen longitud 0). Solo importan los ARCHIVOS: un directorio
            # vacío llamado 'node_modules\' no expone ningún contenido.
            if ($nombre.EndsWith('/') -or $nombre.EndsWith('\')) { continue }
            if ($entry.Length -eq 0 -and $entry.CompressedLength -eq 0 -and $nombre -match '[/\\]$') { continue }

            $motivo = Get-MotivoProhibido -RelativePath $nombre
            if ($motivo) {
                $prohibidos.Add("$nombre  (coincide con: $motivo)")
            }
        }

        if ($prohibidos.Count -gt 0) {
            Write-Host ""
            Write-Host "[VALIDACION] PAQUETE RECHAZADO: contiene $($prohibidos.Count) archivo(s) prohibido(s):" -ForegroundColor Red
            foreach ($p in $prohibidos) { Write-Host "   - $p" -ForegroundColor Red }
            Write-Host ""
            Write-Host "  El paquete NO debe publicarse. Corrige las exclusiones del script." -ForegroundColor Red
            exit 1
        }

        Write-Host "[VALIDACION] OK: el paquete no contiene secretos, respaldos, pruebas ni node_modules." -ForegroundColor Green
    }
    finally {
        if ($zip) { $zip.Dispose() }
    }
}

function Copy-ArbolFiltrado {
    <#
      Copia $Origen -> $Destino respetando las exclusiones.
      Evita copiar archivos prohibidos (no usa robocopy /E a ciegas).
    #>
    param(
        [Parameter(Mandatory=$true)][string]$Origen,
        [Parameter(Mandatory=$true)][string]$Destino
    )

    if (-not (Test-Path $Origen)) { return }

    $origenFull = (Resolve-Path $Origen).Path
    New-Item -ItemType Directory -Force -Path $Destino | Out-Null

    # PODA: se descartan por completo los directorios cuyo nombre (ruta
    # relativa + '/') es prohibido (node_modules, .backups, test, logs...).
    # Así no se recorre ni se recrea su árbol en el destino.
    Get-ChildItem -Path $origenFull -Recurse -Force -File | ForEach-Object {
        $rel = Get-RutaRelativaNormalizada -Base $origenFull -Full $_.FullName

        # Si CUALQUIER componente de la ruta es un directorio prohibido, se salta.
        $partes = $rel -split '/'
        $salta = $false
        for ($i = 0; $i -lt ($partes.Length - 1); $i++) {
            $subdir = ($partes[0..$i] -join '/') + '/'
            if (Test-RutaProhibida -RelativePath $subdir) { $salta = $true; break }
        }
        if ($salta) { return }

        if (-not (Test-RutaPermitida -RelativePath $rel)) { return }

        $destFile = Join-Path $Destino ($rel -replace '/','\')
        $destDir = Split-Path $destFile -Parent
        if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Force -Path $destDir | Out-Null }
        Copy-Item $_.FullName -Destination $destFile -Force
    }
}

# ------------------------------------------------------------------
# Exportar símbolos para uso con dot-source (por claridad; en dot-source
# ya quedan en el ámbito del llamante).
# ------------------------------------------------------------------
Write-Verbose "pack-exclusions.ps1 cargado: $($script:PatronesProhibidos.Count) patrones prohibidos, $($script:PatronesPermitidos.Count) permitidos."