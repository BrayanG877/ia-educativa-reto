# ====================================================
# DESPLIEGUE RAPIDO A AZURE
# ====================================================

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  DESPLIEGUE DE CODIGO A AZURE" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

$appName = "mini-banco77"
$resourceGroup = "mini-banco77_group"

# Paso 1: Verificar Azure CLI
Write-Host "[1] Verificando Azure CLI..." -ForegroundColor Yellow
try {
    $azVersion = az --version 2>&1 | Select-Object -First 1
    Write-Host "   [OK] Azure CLI instalado" -ForegroundColor Green
    Write-Host "   $azVersion" -ForegroundColor Gray
} catch {
    Write-Host "   [X] Azure CLI no disponible en esta terminal" -ForegroundColor Red
    Write-Host "`n   SOLUCION:" -ForegroundColor Yellow
    Write-Host "   1. Cierra esta PowerShell" -ForegroundColor White
    Write-Host "   2. Abre una NUEVA PowerShell" -ForegroundColor White
    Write-Host "   3. cd C:\Users\USER\Downloads\claurst-main\claurst-main" -ForegroundColor White
    Write-Host "   4. .\despliegue-rapido.ps1" -ForegroundColor Cyan
    Write-Host ""
    Read-Host "Presiona Enter para cerrar"
    exit 1
}

Write-Host ""

# Paso 2: Verificar login
Write-Host "[2] Verificando login en Azure..." -ForegroundColor Yellow
try {
    $account = az account show 2>&1 | ConvertFrom-Json
    Write-Host "   [OK] Conectado como: $($account.user.name)" -ForegroundColor Green
} catch {
    Write-Host "   [i] Necesitas iniciar sesion" -ForegroundColor Yellow
    Write-Host "   Abriendo navegador para login...`n" -ForegroundColor Gray

    az login

    if ($LASTEXITCODE -eq 0) {
        Write-Host "   [OK] Login exitoso" -ForegroundColor Green
    } else {
        Write-Host "   [X] Error en login" -ForegroundColor Red
        exit 1
    }
}

Write-Host ""

# Paso 3: Crear ZIP con el codigo
Write-Host "[3] Preparando codigo para despliegue..." -ForegroundColor Yellow

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$zipFile = "deploy-$timestamp.zip"

Write-Host "   Creando archivo ZIP..." -ForegroundColor Gray

# Eliminar ZIP anterior
if (Test-Path "deploy.zip") {
    Remove-Item "deploy.zip" -Force
}

# ------------------------------------------------------------------
# EMPAQUETADO SEGURO (Fase 5C.1): staging con exclusiones compartidas.
# ------------------------------------------------------------------
. (Join-Path $PSScriptRoot 'pack-exclusions.ps1')

$stage = Join-Path $env:TEMP ("ia-edu-rapido-$(Get-Random)")
New-Item -ItemType Directory -Force -Path $stage | Out-Null

try {
    Copy-ArbolFiltrado -Origen (Join-Path $PSScriptRoot 'backend') -Destino (Join-Path $stage 'backend')
    Copy-ArbolFiltrado -Origen (Join-Path $PSScriptRoot 'web')     -Destino (Join-Path $stage 'web')
    foreach ($f in @('package.json','startup.sh','.deployment','web.config')) {
        $src = Join-Path $PSScriptRoot $f
        if ((Test-Path $src) -and (Test-RutaPermitida -RelativePath $f)) { Copy-Item $src (Join-Path $stage $f) -Force }
    }
    Compress-Archive -Path (Join-Path $stage '*') -DestinationPath "deploy.zip" -Force
    Assert-PaqueteLimpio -ZipPath "deploy.zip"
    $zipSize = (Get-Item "deploy.zip").Length / 1MB
    Write-Host "   [OK] ZIP creado y validado: $([math]::Round($zipSize, 2)) MB" -ForegroundColor Green
} catch {
    Write-Host "   [X] Error creando ZIP" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Gray
    exit 1
} finally {
    Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host ""

# Paso 4: Subir codigo a Azure
Write-Host "[4] Subiendo codigo a Azure..." -ForegroundColor Yellow
Write-Host "   Esto puede tardar 1-2 minutos...`n" -ForegroundColor Gray

try {
    az webapp deployment source config-zip `
        --resource-group $resourceGroup `
        --name $appName `
        --src "deploy.zip" `
        --timeout 300

    if ($LASTEXITCODE -eq 0) {
        Write-Host "`n   [OK] Codigo desplegado exitosamente" -ForegroundColor Green
    } else {
        Write-Host "`n   [X] Error en despliegue" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "   [X] Error en despliegue" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Gray
    exit 1
}

Write-Host ""

# Paso 5: Reiniciar App Service
Write-Host "[5] Reiniciando App Service..." -ForegroundColor Yellow
az webapp restart --resource-group $resourceGroup --name $appName --output none

if ($LASTEXITCODE -eq 0) {
    Write-Host "   [OK] App Service reiniciado" -ForegroundColor Green
} else {
    Write-Host "   [!] Error reiniciando (puede ser normal)" -ForegroundColor Yellow
}

Write-Host ""

# Paso 6: Esperar inicializacion
Write-Host "[6] Esperando inicializacion..." -ForegroundColor Yellow
Write-Host "   Esperando 45 segundos para que la app inicie...`n" -ForegroundColor Gray

for ($i = 45; $i -gt 0; $i--) {
    Write-Progress -Activity "Esperando inicializacion" -Status "$i segundos restantes" -PercentComplete ((45-$i)/45*100)
    Start-Sleep -Seconds 1
}

Write-Host "`n   [OK] Tiempo de espera completado" -ForegroundColor Green
Write-Host ""

# Paso 7: Verificar despliegue
Write-Host "[7] Verificando despliegue..." -ForegroundColor Yellow

$productionURL = "https://mini-banco77-d2bccxa4d3c0egb3.eastus2-01.azurewebsites.net"

try {
    $health = Invoke-RestMethod -Uri "$productionURL/health" -TimeoutSec 15 -ErrorAction Stop

    Write-Host "   [EXITO] Backend funcionando!" -ForegroundColor Green
    Write-Host ""
    Write-Host "   Estado: $($health.status)" -ForegroundColor White
    if ($health.database) {
        Write-Host "   Base de datos: $($health.database.status)" -ForegroundColor White
    }
    if ($health.service) {
        Write-Host "   Servicio: $($health.service)" -ForegroundColor White
    }

    $success = $true
} catch {
    Write-Host "   [!] Backend aun no responde completamente" -ForegroundColor Yellow
    Write-Host "   Esto puede ser normal en la primera inicializacion" -ForegroundColor Gray
    $success = $false
}

Write-Host ""

# Resumen final
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  RESULTADO" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

if ($success) {
    Write-Host "[EXCELENTE] Tu aplicacion esta funcionando!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Accede aqui:" -ForegroundColor White
    Write-Host "  $productionURL/login.html" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Credenciales:" -ForegroundColor White
    Write-Host "  Email: camilamiamor@gmail.com" -ForegroundColor Gray
    Write-Host "  Password: 2804" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Abriendo en el navegador..." -ForegroundColor Yellow
    Start-Sleep -Seconds 2
    Start-Process "$productionURL/login.html"

} else {
    Write-Host "[DESPLIEGUE COMPLETADO]" -ForegroundColor Yellow
    Write-Host "El codigo se subio exitosamente a Azure." -ForegroundColor White
    Write-Host ""
    Write-Host "Si el backend no responde aun:" -ForegroundColor Yellow
    Write-Host "1. Espera 2-3 minutos mas (primera inicializacion)" -ForegroundColor White
    Write-Host "2. Ejecuta: .\test-produccion.ps1" -ForegroundColor Cyan
    Write-Host "3. Si aun falla, revisa los logs:" -ForegroundColor White
    Write-Host "   Azure Portal -> mini-banco77 -> Log stream" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Tu app local sigue funcionando:" -ForegroundColor Green
    Write-Host "  http://127.0.0.1:3000/login.html" -ForegroundColor Cyan
}

Write-Host ""

# Limpiar
Write-Host "Limpiando archivos temporales..." -ForegroundColor Gray
Remove-Item "deploy.zip" -Force -ErrorAction SilentlyContinue
Write-Host "[OK] Limpieza completada" -ForegroundColor Green
Write-Host ""
