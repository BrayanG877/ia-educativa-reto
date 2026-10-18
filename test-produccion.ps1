# ====================================================
# VERIFICACION SIMPLE DE PRODUCCION EN AZURE
# ====================================================

$productionURL = "https://mini-banco77-d2bccxa4d3c0egb3.eastus2-01.azurewebsites.net"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  VERIFICACION DE PRODUCCION - AZURE" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Test 1: Sitio principal
Write-Host "[Test 1] Verificando sitio principal..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri $productionURL -TimeoutSec 15 -UseBasicParsing -ErrorAction Stop
    Write-Host "   [OK] Sitio accesible (HTTP $($response.StatusCode))" -ForegroundColor Green
} catch {
    $errorMsg = $_.Exception.Message
    if ($errorMsg -like "*503*") {
        Write-Host "   [X] Error 503 - App detenida o iniciando" -ForegroundColor Red
        Write-Host "   [i] Ve a Azure Portal y click en 'Iniciar'" -ForegroundColor Yellow
    } elseif ($errorMsg -like "*timeout*" -or $errorMsg -like "*Tiempo de espera*") {
        Write-Host "   [X] Timeout - El sitio no responde" -ForegroundColor Red
        Write-Host "   [i] El App Service no esta iniciado" -ForegroundColor Yellow
    } else {
        Write-Host "   [X] Error: $errorMsg" -ForegroundColor Red
    }
}

Write-Host ""

# Test 2: Health Check
Write-Host "[Test 2] Verificando backend..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "$productionURL/health" -TimeoutSec 10 -ErrorAction Stop
    Write-Host "   [OK] Backend funcionando" -ForegroundColor Green
    Write-Host "      Estado: $($health.status)" -ForegroundColor White
    if ($health.database) {
        Write-Host "      Base de datos: $($health.database.status)" -ForegroundColor White
    }
} catch {
    Write-Host "   [X] Backend no responde" -ForegroundColor Red
    Write-Host "   [i] Posibles causas:" -ForegroundColor Yellow
    Write-Host "      1. Variables de entorno no configuradas" -ForegroundColor Gray
    Write-Host "      2. Firewall SQL Server bloqueando conexion" -ForegroundColor Gray
    Write-Host "      3. App Service no iniciado" -ForegroundColor Gray
}

Write-Host ""

# Test 3: Login page
Write-Host "[Test 3] Verificando pagina de login..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$productionURL/login.html" -TimeoutSec 10 -UseBasicParsing -ErrorAction Stop
    Write-Host "   [OK] Login accesible" -ForegroundColor Green
} catch {
    Write-Host "   [X] Login no accesible" -ForegroundColor Red
}

Write-Host ""

# Test 4: Local servers
Write-Host "[Test 4] Verificando servidores locales..." -ForegroundColor Yellow
$backendLocal = Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue
$frontendLocal = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue

if ($backendLocal) {
    Write-Host "   [OK] Backend local (3001): Corriendo" -ForegroundColor Green
} else {
    Write-Host "   [i] Backend local (3001): Detenido" -ForegroundColor Gray
}

if ($frontendLocal) {
    Write-Host "   [OK] Frontend local (3000): Corriendo" -ForegroundColor Green
} else {
    Write-Host "   [i] Frontend local (3000): Detenido" -ForegroundColor Gray
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  RESUMEN" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host "URL de Produccion:" -ForegroundColor White
Write-Host "  $productionURL/login.html`n" -ForegroundColor Cyan

Write-Host "Credenciales de prueba:" -ForegroundColor White
Write-Host "  Email: camilamiamor@gmail.com" -ForegroundColor Gray
Write-Host "  Password: 2804`n" -ForegroundColor Gray

if ($backendLocal) {
    Write-Host "Tu entorno LOCAL sigue funcionando en:" -ForegroundColor Yellow
    Write-Host "  http://127.0.0.1:3000/login.html`n" -ForegroundColor Cyan
}

Write-Host "Para ver logs de Azure ejecuta:" -ForegroundColor White
Write-Host "  az webapp log tail --name mini-banco77 --resource-group mini-banco77_group`n" -ForegroundColor Gray
