# ====================================================
# DESPLIEGUE DIRECTO CON KUDU (SIN BUILD)
# ====================================================

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  DESPLIEGUE DIRECTO A AZURE" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

$appName = "mini-banco77"
$resourceGroup = "mini-banco77_group"

# Paso 1: Verificar Azure CLI
Write-Host "[1] Verificando Azure CLI..." -ForegroundColor Yellow
try {
    $azVersion = az --version 2>&1 | Select-Object -First 1
    Write-Host "   [OK] Azure CLI instalado" -ForegroundColor Green
} catch {
    Write-Host "   [X] Azure CLI no disponible" -ForegroundColor Red
    Write-Host "`n   Usa el METODO 2 (manual) de DESPLIEGUE-MANUAL.md" -ForegroundColor Yellow
    exit 1
}

Write-Host ""

# Paso 2: Verificar login
Write-Host "[2] Verificando sesion..." -ForegroundColor Yellow
try {
    $account = az account show 2>&1 | ConvertFrom-Json
    Write-Host "   [OK] Conectado: $($account.name)" -ForegroundColor Green
} catch {
    Write-Host "   [X] No hay sesion activa" -ForegroundColor Red
    Write-Host "   Ejecuta: az login" -ForegroundColor Yellow
    exit 1
}

Write-Host ""

# Paso 3: Obtener credenciales de publishing
Write-Host "[3] Obteniendo credenciales de Kudu..." -ForegroundColor Yellow

$creds = az webapp deployment list-publishing-credentials --name $appName --resource-group $resourceGroup 2>&1 | ConvertFrom-Json

if ($creds) {
    $username = $creds.publishingUserName
    $password = $creds.publishingPassword
    $kuduUrl = "https://$appName.scm.azurewebsites.net/api/zipdeploy"
    Write-Host "   [OK] Credenciales obtenidas" -ForegroundColor Green
} else {
    Write-Host "   [X] Error obteniendo credenciales" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Paso 4: Instalar dependencias del backend localmente
Write-Host "[4] Instalando dependencias del backend..." -ForegroundColor Yellow
Write-Host "   (Esto asegura que node_modules este completo)" -ForegroundColor Gray

Push-Location "backend"
npm install --production --no-audit 2>&1 | Out-Null
Pop-Location

Write-Host "   [OK] Dependencias instaladas" -ForegroundColor Green
Write-Host ""

# Paso 5: Crear ZIP optimizado
Write-Host "[5] Creando paquete de despliegue..." -ForegroundColor Yellow

# Limpiar ZIP anterior
if (Test-Path "deploy-directo.zip") {
    Remove-Item "deploy-directo.zip" -Force
}

# ------------------------------------------------------------------
# EMPAQUETADO SEGURO (Fase 5C.1): Compress-Archive directo sobre "backend"
# incluia .env, .env.production, .backups/, test/ y node_modules.
# ------------------------------------------------------------------
. (Join-Path $PSScriptRoot 'pack-exclusions.ps1')

$stage = Join-Path $env:TEMP ("ia-edu-directo-$(Get-Random)")
New-Item -ItemType Directory -Force -Path $stage | Out-Null

try {
    Copy-ArbolFiltrado -Origen (Join-Path $PSScriptRoot 'backend') -Destino (Join-Path $stage 'backend')
    Copy-ArbolFiltrado -Origen (Join-Path $PSScriptRoot 'web')     -Destino (Join-Path $stage 'web')
    foreach ($f in @('package.json','web.config')) {
        $src = Join-Path $PSScriptRoot $f
        if ((Test-Path $src) -and (Test-RutaPermitida -RelativePath $f)) { Copy-Item $src (Join-Path $stage $f) -Force }
    }

    Write-Host "   Comprimiendo archivos..." -ForegroundColor Gray
    Compress-Archive -Path (Join-Path $stage '*') -DestinationPath "deploy-directo.zip" -Force
} finally {
    Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue
}

# VALIDACIÓN OBLIGATORIA previa a cualquier publicación.
Assert-PaqueteLimpio -ZipPath "deploy-directo.zip"

$zipSize = (Get-Item "deploy-directo.zip").Length / 1MB
Write-Host "   [OK] Paquete creado y validado: $([math]::Round($zipSize, 2)) MB" -ForegroundColor Green

Write-Host ""

# Paso 6: Subir via Kudu API (sin build de Oryx)
Write-Host "[6] Subiendo a Azure via Kudu..." -ForegroundColor Yellow
Write-Host "   Esto tarda 30-60 segundos..." -ForegroundColor Gray
Write-Host ""

$base64Auth = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("$($username):$($password)"))

try {
    $response = Invoke-RestMethod -Uri $kuduUrl `
        -Method Post `
        -InFile "deploy-directo.zip" `
        -Headers @{
            Authorization = "Basic $base64Auth"
            "Content-Type" = "application/zip"
        } `
        -TimeoutSec 300 `
        -ErrorAction Stop

    Write-Host "   [OK] Codigo subido exitosamente" -ForegroundColor Green
} catch {
    Write-Host "   [X] Error subiendo codigo" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Gray

    if ($_.Exception.Response) {
        $statusCode = $_.Exception.Response.StatusCode.value__
        Write-Host "   Status Code: $statusCode" -ForegroundColor Gray
    }

    Write-Host "`n   ALTERNATIVA: Usa el METODO 2 (Kudu manual)" -ForegroundColor Yellow
    Write-Host "   1. Abre: https://mini-banco77.scm.azurewebsites.net/ZipDeployUI" -ForegroundColor Cyan
    Write-Host "   2. Arrastra deploy-directo.zip" -ForegroundColor White
    Write-Host "   3. Espera a que termine" -ForegroundColor White
    exit 1
}

Write-Host ""

# Paso 7: Configurar startup command
Write-Host "[7] Configurando comando de inicio..." -ForegroundColor Yellow

az webapp config set `
    --resource-group $resourceGroup `
    --name $appName `
    --startup-file "node backend/src/server.js" `
    --output none

Write-Host "   [OK] Comando de inicio configurado" -ForegroundColor Green
Write-Host ""

# Paso 8: Reiniciar
Write-Host "[8] Reiniciando App Service..." -ForegroundColor Yellow
az webapp restart --resource-group $resourceGroup --name $appName --output none
Write-Host "   [OK] Servicio reiniciado" -ForegroundColor Green
Write-Host ""

# Paso 9: Esperar inicializacion
Write-Host "[9] Esperando inicializacion..." -ForegroundColor Yellow
Write-Host "   La primera inicializacion puede tardar 60-90 segundos`n" -ForegroundColor Gray

for ($i = 60; $i -gt 0; $i--) {
    Write-Progress -Activity "Esperando que Azure inicie la aplicacion" -Status "$i segundos restantes" -PercentComplete ((60-$i)/60*100)
    Start-Sleep -Seconds 1
}

Write-Host "`n   [OK] Tiempo de espera completado" -ForegroundColor Green
Write-Host ""

# Paso 10: Verificar
Write-Host "[10] Verificando despliegue..." -ForegroundColor Yellow

$productionURL = "https://mini-banco77-d2bccxa4d3c0egb3.eastus2-01.azurewebsites.net"
$maxIntentos = 5
$success = $false

for ($i = 1; $i -le $maxIntentos; $i++) {
    Write-Host "   Intento $i/$maxIntentos..." -ForegroundColor Gray

    try {
        $health = Invoke-RestMethod -Uri "$productionURL/health" -TimeoutSec 15 -ErrorAction Stop

        Write-Host "   [EXITO] Backend funcionando!" -ForegroundColor Green
        Write-Host ""
        Write-Host "   Estado: $($health.status)" -ForegroundColor White
        if ($health.database) {
            Write-Host "   Base de datos: $($health.database.status)" -ForegroundColor White
        }

        $success = $true
        break
    } catch {
        if ($i -lt $maxIntentos) {
            Write-Host "   Aun no responde, esperando 15 segundos..." -ForegroundColor Yellow
            Start-Sleep -Seconds 15
        }
    }
}

Write-Host ""

# Resumen
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  RESULTADO" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

if ($success) {
    Write-Host "[EXCELENTE] Tu aplicacion esta funcionando en Azure!" -ForegroundColor Green
    Write-Host ""
    Write-Host "URLs de tu aplicacion:" -ForegroundColor White
    Write-Host "  Login:  $productionURL/login.html" -ForegroundColor Cyan
    Write-Host "  App:    $productionURL/index.html" -ForegroundColor Cyan
    Write-Host "  Health: $productionURL/health" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Credenciales de prueba:" -ForegroundColor White
    Write-Host "  Email: camilamiamor@gmail.com" -ForegroundColor Gray
    Write-Host "  Password: 2804" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Funciones disponibles:" -ForegroundColor White
    Write-Host "  [OK] Login con JWT" -ForegroundColor Green
    Write-Host "  [OK] Chat con IA (Claude Sonnet 4)" -ForegroundColor Green
    Write-Host "  [OK] Metodo socratico" -ForegroundColor Green
    Write-Host "  [OK] 13 materias" -ForegroundColor Green
    Write-Host "  [OK] 7 herramientas educativas" -ForegroundColor Green
    Write-Host ""
    Write-Host "Abriendo en el navegador..." -ForegroundColor Yellow
    Start-Sleep -Seconds 2
    Start-Process "$productionURL/login.html"

} else {
    Write-Host "[ADVERTENCIA] Despliegue completado pero backend no responde" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "El codigo se subio correctamente, pero puede necesitar mas tiempo." -ForegroundColor White
    Write-Host ""
    Write-Host "Opciones:" -ForegroundColor Yellow
    Write-Host "1. Espera 2-3 minutos mas y ejecuta: .\test-produccion.ps1" -ForegroundColor White
    Write-Host "2. Revisa los logs en Azure Portal:" -ForegroundColor White
    Write-Host "   mini-banco77 -> Monitoring -> Log stream" -ForegroundColor Cyan
    Write-Host ""
}

# Limpiar
Write-Host "Limpiando archivos temporales..." -ForegroundColor Gray
Remove-Item "deploy-directo.zip" -Force -ErrorAction SilentlyContinue
Write-Host "[OK] Limpieza completada" -ForegroundColor Green
Write-Host ""
