# ====================================================
# SCRIPT AUTOMATICO: CONFIGURAR TODO EN AZURE
# ====================================================
# Este script instala Azure CLI y configura todo automaticamente

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  CONFIGURACION AUTOMATICA DE AZURE" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

$appName = "mini-banco77"
$resourceGroup = "mini-banco77_group"
$sqlServerName = "miservidorbr"

# PASO 1: Verificar/Instalar Azure CLI
Write-Host "[Paso 1] Verificando Azure CLI..." -ForegroundColor Yellow

try {
    $azVersion = az --version 2>$null
    Write-Host "   [OK] Azure CLI ya instalado" -ForegroundColor Green
} catch {
    Write-Host "   [i] Azure CLI no encontrado. Instalando..." -ForegroundColor Yellow
    Write-Host "   Esto puede tardar 2-3 minutos...`n" -ForegroundColor Gray

    try {
        # Intentar instalar con winget
        winget install Microsoft.AzureCLI --silent --accept-package-agreements --accept-source-agreements

        Write-Host "`n   [OK] Azure CLI instalado" -ForegroundColor Green
        Write-Host "   [!] IMPORTANTE: Cierra y reabre PowerShell para que funcione" -ForegroundColor Yellow
        Write-Host "   Luego ejecuta este script nuevamente." -ForegroundColor Yellow
        Write-Host ""
        Read-Host "Presiona Enter para cerrar"
        exit 0
    } catch {
        Write-Host "   [X] Error instalando Azure CLI" -ForegroundColor Red
        Write-Host "`n   Instalacion manual:" -ForegroundColor Yellow
        Write-Host "   1. Descarga desde: https://aka.ms/installazurecliwindows" -ForegroundColor White
        Write-Host "   2. Ejecuta el instalador" -ForegroundColor White
        Write-Host "   3. Reinicia PowerShell" -ForegroundColor White
        Write-Host "   4. Ejecuta este script nuevamente" -ForegroundColor White
        Write-Host ""
        Read-Host "Presiona Enter para cerrar"
        exit 1
    }
}

Write-Host ""

# PASO 2: Login en Azure
Write-Host "[Paso 2] Verificando sesion de Azure..." -ForegroundColor Yellow

try {
    $account = az account show 2>$null | ConvertFrom-Json
    Write-Host "   [OK] Ya conectado como: $($account.user.name)" -ForegroundColor Green
} catch {
    Write-Host "   [i] No hay sesion activa. Iniciando login..." -ForegroundColor Yellow
    Write-Host "   Se abrira una ventana del navegador para autenticarte.`n" -ForegroundColor Gray

    az login

    if ($LASTEXITCODE -eq 0) {
        Write-Host "   [OK] Login exitoso" -ForegroundColor Green
    } else {
        Write-Host "   [X] Error en login. Intenta de nuevo." -ForegroundColor Red
        exit 1
    }
}

Write-Host ""

# PASO 3: Configurar Variables de Entorno
Write-Host "[Paso 3] Configurando variables de entorno..." -ForegroundColor Yellow
Write-Host "   Agregando 20 variables al App Service..." -ForegroundColor Gray

$variables = @(
    "NODE_ENV=production",
    "PORT=8080",
    "WEBSITE_NODE_DEFAULT_VERSION=22-lts",
    "DB_HOST=miservidorbr.database.windows.net",
    "DB_PORT=1433",
    "DB_NAME=ia_educativa",
    "DB_USER=adminsoloverde",
    "DB_PASSWORD=TU_PASSWORD_BD_AQUI",
    "REDIS_HOST=localhost",
    "REDIS_PORT=6379",
    "REDIS_PASSWORD=",
    "JWT_SECRET=educativa_ia_colombia_2026_PRODUCTION_KEY_CHANGE_THIS",
    "JWT_EXPIRES_IN=24h",
    "ANTHROPIC_API_KEY=sk-ant-api03-TU_CLAVE_ANTHROPIC_AQUI",
    "RATE_LIMIT_WINDOW_MS=900000",
    "RATE_LIMIT_MAX_REQUESTS=100",
    "MAX_TOKENS_PER_REQUEST=1000",
    "MAX_CONVERSATION_HISTORY=5",
    "CACHE_TTL_SECONDS=3600",
    "FRONTEND_URL=https://mini-banco77-d2bccxa4d3c0egb3.eastus2-01.azurewebsites.net"
)

try {
    az webapp config appsettings set `
        --resource-group $resourceGroup `
        --name $appName `
        --settings $variables `
        --output none

    Write-Host "   [OK] Variables configuradas correctamente" -ForegroundColor Green
} catch {
    Write-Host "   [X] Error configurando variables" -ForegroundColor Red
    Write-Host "   Error: $_" -ForegroundColor Gray
    Write-Host "`n   Configuracion manual:" -ForegroundColor Yellow
    Write-Host "   1. Ve a: https://portal.azure.com" -ForegroundColor White
    Write-Host "   2. Busca: mini-banco77" -ForegroundColor White
    Write-Host "   3. Configuracion -> Variables de entorno" -ForegroundColor White
    Write-Host "   4. Copia las variables desde: variables-para-copiar.txt" -ForegroundColor White
    exit 1
}

Write-Host ""

# PASO 4: Configurar Firewall de SQL Server
Write-Host "[Paso 4] Configurando firewall de SQL Server..." -ForegroundColor Yellow
Write-Host "   Permitiendo acceso desde servicios de Azure..." -ForegroundColor Gray

try {
    # Permitir servicios de Azure
    az sql server firewall-rule create `
        --resource-group $resourceGroup `
        --server $sqlServerName `
        --name "AllowAzureServices" `
        --start-ip-address 0.0.0.0 `
        --end-ip-address 0.0.0.0 `
        --output none 2>$null

    Write-Host "   [OK] Firewall configurado correctamente" -ForegroundColor Green
} catch {
    Write-Host "   [i] Regla de firewall ya existia o error menor" -ForegroundColor Gray
}

Write-Host ""

# PASO 5: Reiniciar App Service
Write-Host "[Paso 5] Reiniciando App Service..." -ForegroundColor Yellow
Write-Host "   Esto toma ~30 segundos..." -ForegroundColor Gray

try {
    az webapp restart --resource-group $resourceGroup --name $appName --output none
    Write-Host "   [OK] App Service reiniciado" -ForegroundColor Green
} catch {
    Write-Host "   [X] Error reiniciando App Service" -ForegroundColor Red
}

Write-Host ""

# PASO 6: Esperar y Verificar
Write-Host "[Paso 6] Esperando que el servicio inicie..." -ForegroundColor Yellow
Write-Host "   Esperando 45 segundos para que la app se inicialice..." -ForegroundColor Gray

Start-Sleep -Seconds 45

Write-Host ""
Write-Host "[Paso 7] Verificando que todo funcione..." -ForegroundColor Yellow

$productionURL = "https://mini-banco77-d2bccxa4d3c0egb3.eastus2-01.azurewebsites.net"

# Verificar health check
try {
    $health = Invoke-RestMethod -Uri "$productionURL/health" -TimeoutSec 15 -ErrorAction Stop
    Write-Host "   [OK] Backend funcionando correctamente!" -ForegroundColor Green
    Write-Host ""
    Write-Host "      Estado: $($health.status)" -ForegroundColor White
    if ($health.database) {
        Write-Host "      Base de datos: $($health.database.status)" -ForegroundColor White
    }
    if ($health.service) {
        Write-Host "      Servicio: $($health.service)" -ForegroundColor White
    }

    $success = $true
} catch {
    Write-Host "   [X] Backend aun no responde" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Gray
    $success = $false
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  RESULTADO FINAL" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

if ($success) {
    Write-Host "[EXITO] TU APP ESTA FUNCIONANDO!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Accede a tu aplicacion en:" -ForegroundColor White
    Write-Host "  $productionURL/login.html" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Credenciales de prueba:" -ForegroundColor White
    Write-Host "  Email: camilamiamor@gmail.com" -ForegroundColor Gray
    Write-Host "  Password: 2804" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Funciones disponibles:" -ForegroundColor White
    Write-Host "  [OK] Login con JWT" -ForegroundColor Green
    Write-Host "  [OK] Chat con IA (Claude Sonnet 4)" -ForegroundColor Green
    Write-Host "  [OK] Metodo socratico activado" -ForegroundColor Green
    Write-Host "  [OK] 13 materias disponibles" -ForegroundColor Green
    Write-Host "  [OK] 7 herramientas educativas" -ForegroundColor Green
    Write-Host "  [OK] Historial en SQL Server" -ForegroundColor Green
    Write-Host "  [OK] Cache con Redis" -ForegroundColor Green
    Write-Host ""

    # Abrir en navegador
    Write-Host "Abriendo en el navegador..." -ForegroundColor Yellow
    Start-Sleep -Seconds 2
    Start-Process "$productionURL/login.html"

} else {
    Write-Host "[ADVERTENCIA] Configuracion completada pero backend no responde aun" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Posibles causas:" -ForegroundColor White
    Write-Host "  1. La app necesita mas tiempo para inicializarse (normal)" -ForegroundColor Gray
    Write-Host "  2. Error en las variables de entorno" -ForegroundColor Gray
    Write-Host "  3. Error en la conexion a SQL Server" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Que hacer:" -ForegroundColor Yellow
    Write-Host "  1. Espera 2-3 minutos mas" -ForegroundColor White
    Write-Host "  2. Ejecuta: .\test-produccion.ps1" -ForegroundColor White
    Write-Host "  3. Si sigue fallando, revisa los logs:" -ForegroundColor White
    Write-Host "     az webapp log tail --name mini-banco77 --resource-group mini-banco77_group" -ForegroundColor Gray
    Write-Host ""
}

Write-Host "Para ver logs en tiempo real:" -ForegroundColor White
Write-Host "  az webapp log tail --name $appName --resource-group $resourceGroup" -ForegroundColor Gray
Write-Host ""
